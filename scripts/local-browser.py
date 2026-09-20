"""Owned local browser-use session. JSONL protocol; no LLM or personal profile."""
import asyncio, base64, glob, json, os, re, signal, sys
from urllib.parse import urlparse

protocol = sys.stdout
sys.stdout = sys.stderr
os.environ['ANONYMIZED_TELEMETRY'] = 'false'

async def main():
    task = asyncio.current_task()
    asyncio.get_running_loop().add_signal_handler(signal.SIGTERM, task.cancel)
    from browser_use import BrowserSession
    paths = glob.glob(os.path.expanduser('~/Library/Caches/ms-playwright/chromium-*/chrome-mac-*/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'))
    native_origin = sys.argv[3] if len(sys.argv) > 3 and sys.argv[3] else None
    browser = BrowserSession(headless=True, enable_default_extensions=False, user_data_dir=None, viewport={'width': int(sys.argv[1]) if len(sys.argv) > 1 else 1440, 'height': int(sys.argv[2]) if len(sys.argv) > 2 else 900}, executable_path=os.environ.get('LOCAL_BROWSER_EXECUTABLE') or (sorted(paths)[-1] if paths else None), allowed_domains=[native_origin or 'https://www.newegg.com'])
    try:
        await browser.start()
        while True:
            line = await asyncio.to_thread(sys.stdin.readline)
            if not line:
                break
            request = json.loads(line)
            try:
                if 'native' in request:
                    if not native_origin:
                        raise ValueError('Native actions are not enabled for this session.')
                    command = request['native']
                    if 'url' in command:
                        parsed = urlparse(command['url'])
                        if f'{parsed.scheme}://{parsed.netloc}' != native_origin:
                            raise ValueError('Navigation left the allowed origin.')
                        if native_origin != 'https://www.newegg.com' and parsed.path != '/browser-agent-benchmark':
                            raise ValueError('Local navigation is limited to the benchmark fixture.')
                        await browser.navigate_to(command['url'])
                    page = await browser.get_current_page()
                    final_url = await page.evaluate('() => location.href')
                    parsed = urlparse(final_url)
                    if f'{parsed.scheme}://{parsed.netloc}' != native_origin:
                        raise ValueError('The browser left the allowed task origin.')
                    value = None
                    if 'script' in command:
                        # browser-use 0.13.10 JSON-stringifies objects out of
                        # evaluate(); tolerate a decoded value so a future pin
                        # returning Playwright-style types cannot break silently.
                        raw = await page.evaluate(command['script'])
                        value = json.loads(raw) if isinstance(raw, (str, bytes, bytearray)) else raw
                    screenshot = base64.b64encode(await browser.take_screenshot(format='jpeg', quality=65)).decode()
                    protocol.write(json.dumps({'id': request['id'], 'result': {'url': final_url, 'value': value, 'screenshot': screenshot}}) + '\n')
                    protocol.flush()
                    continue
                url = request['url']
                parsed = urlparse(url)
                if parsed.scheme != 'https' or parsed.netloc != 'www.newegg.com' or not re.fullmatch(r'/(?:[^/]+/)?p/(?:pl|[A-Za-z0-9-]+)', parsed.path):
                    raise ValueError('Only Newegg listing and product pages are supported.')
                await browser.navigate_to(url)
                page = await browser.get_current_page()
                # Bounded readiness wait; a challenge is retained as evidence, never bypassed.
                for _ in range(20):
                    ready = await page.evaluate('() => document.readyState === "complete" && !!document.querySelector(".item-cell, .product-buy-box")')
                    if ready is True or ready == 'true':
                        break
                    await asyncio.sleep(.25)
                body = await page.evaluate('() => document.documentElement.outerHTML')
                if len(body.encode('utf-8')) > 8 * 1024 * 1024:
                    raise ValueError('Rendered document exceeds 8 MB.')
                final_url = await page.evaluate('() => location.href')
                screenshot = base64.b64encode(await browser.take_screenshot(format='jpeg', quality=65)).decode()
                result = {'url': final_url, 'body': body, 'contentType': 'text/html', 'screenshot': screenshot}
                protocol.write(json.dumps({'id': request['id'], 'result': result}) + '\n')
            except Exception as error:
                protocol.write(json.dumps({'id': request['id'], 'error': str(error)[:1000]}) + '\n')
            protocol.flush()
    finally:
        await browser.kill()

asyncio.run(main())
