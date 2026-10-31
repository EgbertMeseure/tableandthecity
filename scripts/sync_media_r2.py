#!/usr/bin/env python3
"""Mirror the repo's image files to the Cloudflare R2 bucket that serves https://img.tableandthecity.com.

Same relative paths in the bucket as in the repo: img/places/gent/<id>/p1-1400.webp -> s3://tatc-media/img/places/gent/<id>/p1-1400.webp
Re-runnable: an object whose ETag already equals the local file's MD5 is skipped (R2 single-part ETag = MD5),
so only new or changed photos are uploaded. Nothing is ever deleted unless --prune is given.

Credentials come from the environment only (never pass them on the command line, never commit them):
  R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY
Optional env: R2_ENDPOINT (default: the tatc account endpoint), R2_BUCKET (default tatc-media)

  python3 scripts/sync_media_r2.py                 # upload new/changed images under img/
  python3 scripts/sync_media_r2.py --dry-run       # only show what would be uploaded
  python3 scripts/sync_media_r2.py img/places/gent # only a sub-tree
  python3 scripts/sync_media_r2.py --fix-meta      # also rewrite Content-Type/Cache-Control on unchanged objects whose headers differ
  python3 scripts/sync_media_r2.py --prune         # also delete bucket objects under the synced prefixes that no longer exist locally

Cache-Control: photo file names are NOT content-stamped (a new pick overwrites p1-1400.webp in place), so the default is a
moderate  'public, max-age=86400, stale-while-revalidate=604800'  (browsers/CDN refresh within a day; stale copies are still
served instantly while revalidating). Files whose name carries a content hash/version (e.g. foo.3f2a9c1e.webp or foo-v2.webp)
get 'public, max-age=31536000, immutable'.
"""
import argparse, hashlib, mimetypes, os, re, sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ENDPOINT = os.environ.get('R2_ENDPOINT', 'https://66f3c4c8124fd67dd7fa8aa6ef992383.r2.cloudflarestorage.com')
BUCKET = os.environ.get('R2_BUCKET', 'tatc-media')
EXTS = {'.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.avif': 'image/avif',
        '.gif': 'image/gif', '.svg': 'image/svg+xml'}
CACHE_SHORT = 'public, max-age=86400, stale-while-revalidate=604800'
CACHE_IMMUTABLE = 'public, max-age=31536000, immutable'
STAMPED = re.compile(r'[.-](?:[0-9a-f]{8,}|v\d+)\.[a-z0-9]+$', re.I)


def cache_control(name):
    return CACHE_IMMUTABLE if STAMPED.search(name) else CACHE_SHORT


def md5(p):
    h = hashlib.md5()
    with open(p, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''): h.update(chunk)
    return h.hexdigest()


def client():
    import boto3
    from botocore.config import Config
    kid, sec = os.environ.get('R2_ACCESS_KEY_ID'), os.environ.get('R2_SECRET_ACCESS_KEY')
    if not kid or not sec: sys.exit('R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY are not set in the environment')
    return boto3.client('s3', endpoint_url=ENDPOINT, region_name='auto', aws_access_key_id=kid, aws_secret_access_key=sec,
                        config=Config(retries={'max_attempts': 8, 'mode': 'adaptive'}, max_pool_connections=32))


def local_files(roots):
    out = {}
    for r in roots:
        base = (ROOT / r).resolve()
        it = [base] if base.is_file() else base.rglob('*')
        for p in it:
            if p.is_file() and p.suffix.lower() in EXTS:
                out[p.relative_to(ROOT).as_posix()] = p
    return out


def remote_index(s3, prefixes):
    idx = {}
    pag = s3.get_paginator('list_objects_v2')
    for pre in prefixes:
        for page in pag.paginate(Bucket=BUCKET, Prefix=pre):
            for o in page.get('Contents', []): idx[o['Key']] = o['ETag'].strip('"')
    return idx


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('paths', nargs='*', default=['img'], help='repo-relative files/dirs to sync (default: img)')
    ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--fix-meta', action='store_true', help='HEAD unchanged objects and rewrite headers that differ')
    ap.add_argument('--prune', action='store_true', help='delete remote objects under the given paths that are gone locally')
    ap.add_argument('-j', '--jobs', type=int, default=16)
    a = ap.parse_args()

    files = local_files(a.paths)
    s3 = client()
    prefixes = [p.rstrip('/') + ('/' if (ROOT / p).is_dir() else '') for p in a.paths]
    remote = remote_index(s3, prefixes)
    todo, same = [], []
    for key, p in sorted(files.items()):
        (same if remote.get(key) == md5(p) else todo).append(key)
    gone = sorted(k for k in remote if k not in files) if a.prune else []
    up_bytes = sum(files[k].stat().st_size for k in todo)
    print(f'{len(files)} local images, {len(remote)} in bucket under {prefixes}; '
          f'{len(todo)} to upload ({up_bytes/1e6:.1f} MB), {len(same)} unchanged' + (f', {len(gone)} to delete' if a.prune else ''))
    if a.dry_run:
        for k in todo[:50]: print('  +', k)
        for k in gone[:50]: print('  -', k)
        return

    def put(key):
        p = files[key]
        with open(p, 'rb') as f:
            s3.put_object(Bucket=BUCKET, Key=key, Body=f, ContentType=EXTS[p.suffix.lower()], CacheControl=cache_control(p.name))
        return key

    def fix(key):
        p = files[key]
        want_ct, want_cc = EXTS[p.suffix.lower()], cache_control(p.name)
        h = s3.head_object(Bucket=BUCKET, Key=key)
        if h.get('ContentType') == want_ct and h.get('CacheControl') == want_cc: return None
        s3.copy_object(Bucket=BUCKET, Key=key, CopySource={'Bucket': BUCKET, 'Key': key}, MetadataDirective='REPLACE',
                       ContentType=want_ct, CacheControl=want_cc)
        return key

    errors = 0
    def run(fn, keys, label):
        nonlocal errors
        done = changed = 0
        with ThreadPoolExecutor(a.jobs) as ex:
            futs = {ex.submit(fn, k): k for k in keys}
            for fu in as_completed(futs):
                try:
                    if fu.result(): changed += 1
                except Exception as e:  # noqa: BLE001
                    errors += 1; print(f'  ! {label} {futs[fu]}: {e}', file=sys.stderr)
                done += 1
                if done % 500 == 0: print(f'  {label}: {done}/{len(keys)}', flush=True)
        return changed

    n = run(put, todo, 'upload')
    print(f'uploaded {n} files ({up_bytes/1e6:.1f} MB)')
    if a.fix_meta:
        print(f'fixed headers on {run(fix, same, "fix-meta")} unchanged objects')
    if gone:
        for i in range(0, len(gone), 1000):
            s3.delete_objects(Bucket=BUCKET, Delete={'Objects': [{'Key': k} for k in gone[i:i + 1000]], 'Quiet': True})
        print(f'deleted {len(gone)} objects')
    sys.exit(1 if errors else 0)


if __name__ == '__main__':
    main()
