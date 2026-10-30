#!/usr/bin/env python3
"""Upload an AAB to a Google Play track (default: internal) with the androidpublisher v3 API.

Usage:
  python play_upload.py path/to/app.aab [--track internal] [--status completed|draft] [--notes "What's new"]
  python play_upload.py --check          # only test auth: opens and deletes an edit

The service-account key is read from $PLAY_SERVICE_ACCOUNT_JSON
(default /home/box/.secrets/googleplay/service-account.json). Never commit that file.
Needs: pip install pyjwt cryptography
Note: Play only accepts API uploads after the first AAB has been uploaded by hand in Play Console
(until then edits.insert returns 404 "Package not found"). While the app is still a draft app
(never published), releases must use --status draft.
"""
import argparse, json, os, sys, time, urllib.parse, urllib.request, urllib.error
import jwt

PACKAGE = 'com.tableandthecity.app'
API = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/' + PACKAGE
UPLOAD = 'https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications/' + PACKAGE
KEY = os.environ.get('PLAY_SERVICE_ACCOUNT_JSON', '/home/box/.secrets/googleplay/service-account.json')


def token():
    sa = json.load(open(KEY))
    now = int(time.time())
    assertion = jwt.encode({'iss': sa['client_email'], 'scope': 'https://www.googleapis.com/auth/androidpublisher',
                            'aud': sa['token_uri'], 'iat': now, 'exp': now + 3600},
                           sa['private_key'], algorithm='RS256', headers={'kid': sa['private_key_id']})
    body = urllib.parse.urlencode({'grant_type': 'urn:ietf:params:oauth:grant-type:jwt-bearer', 'assertion': assertion}).encode()
    with urllib.request.urlopen(urllib.request.Request(sa['token_uri'], data=body)) as r:
        return json.load(r)['access_token']


def call(tok, method, url, body=None, data=None, ctype='application/json'):
    if body is not None:
        data = json.dumps(body).encode()
    req = urllib.request.Request(url, data=data, method=method, headers={'Authorization': 'Bearer ' + tok, 'Content-Type': ctype})
    try:
        with urllib.request.urlopen(req, timeout=600) as r:
            t = r.read()
            return r.status, (json.loads(t) if t else {})
    except urllib.error.HTTPError as e:
        t = e.read().decode(errors='replace')
        try:
            return e.code, json.loads(t)
        except ValueError:
            return e.code, t


def die(step, s, d):
    msg = d.get('error', {}).get('message') if isinstance(d, dict) else d
    sys.exit(f'{step} failed: HTTP {s}: {msg}')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('aab', nargs='?')
    ap.add_argument('--track', default='internal')
    ap.add_argument('--status', default='completed', choices=['completed', 'draft'])
    ap.add_argument('--notes', default='')
    ap.add_argument('--check', action='store_true')
    a = ap.parse_args()
    tok = token()
    print('Service account auth OK (got an access token).')
    s, edit = call(tok, 'POST', API + '/edits', {})
    if s != 200:
        die('edits.insert', s, edit)
    eid = edit['id']
    if a.check:
        call(tok, 'DELETE', f'{API}/edits/{eid}')
        print('edits.insert OK: the API can manage', PACKAGE)
        return
    if not a.aab:
        sys.exit('give an .aab path')
    print('Uploading', a.aab, f'({os.path.getsize(a.aab) / 1e6:.1f} MB) ...')
    s, b = call(tok, 'POST', f'{UPLOAD}/edits/{eid}/bundles?uploadType=media', data=open(a.aab, 'rb').read(), ctype='application/octet-stream')
    if s != 200:
        die('bundles.upload', s, b)
    vc = str(b['versionCode'])
    print('Uploaded versionCode', vc)
    rel = {'versionCodes': [vc], 'status': a.status}
    if a.notes:
        rel['releaseNotes'] = [{'language': 'en-US', 'text': a.notes}]
    s, t = call(tok, 'PUT', f'{API}/edits/{eid}/tracks/{a.track}', {'track': a.track, 'releases': [rel]})
    if s != 200:
        die('tracks.update', s, t)
    s, c = call(tok, 'POST', f'{API}/edits/{eid}:commit')
    if s != 200:
        die('edits.commit', s, c)
    print(f'Done: versionCode {vc} on the {a.track} track ({a.status}).')


if __name__ == '__main__':
    main()
