import { test as base, expect, type Page } from '@playwright/test';

const canvasName = 'Interactive generative garden canvas';

interface BrowserDiagnostics {
  browserFailures: Array<string>;
  consoleErrors: Array<string>;
}

const isLocalUrl = (url: string) => {
  const { hostname } = new URL(url);
  return hostname === '127.0.0.1' || hostname === 'localhost';
};

const collectLocalBrowserFailures = (page: Page) => {
  const failures: Array<string> = [];

  page.on('requestfailed', (request) => {
    if (!isLocalUrl(request.url())) {
      return;
    }

    const failure = request.failure();
    failures.push(`${request.method()} ${request.url()} ${failure?.errorText}`);
  });
  page.on('response', (response) => {
    if (response.status() < 400 || !isLocalUrl(response.url())) {
      return;
    }

    failures.push(`${response.status()} ${response.url()}`);
  });

  return failures;
};

const test = base.extend<{ browserDiagnostics: BrowserDiagnostics }>({
  browserDiagnostics: [
    async ({ page }, use) => {
      const browserFailures = collectLocalBrowserFailures(page);
      const consoleErrors: Array<string> = [];

      page.on('console', (message) => {
        if (message.type() === 'error') {
          consoleErrors.push(message.text());
        }
      });

      await use({ browserFailures, consoleErrors });

      expect(consoleErrors).toEqual([]);
      expect(browserFailures).toEqual([]);
    },
    { auto: true },
  ],
});

const disableWebGpu = async (page: Page) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'gpu', {
      configurable: true,
      value: undefined,
    });
  });
};

test('starts the WebGPU garden and accepts drawing input', async ({ page }) => {
  await page.addInitScript((expectedCanvasName) => {
    const captureState = { count: 0 };
    Object.defineProperty(window, '__fleetingGardenPointerCaptures', {
      configurable: true,
      value: captureState,
    });

    const originalSetPointerCapture = Element.prototype.setPointerCapture;
    Element.prototype.setPointerCapture = function setPointerCapture(pointerId) {
      if (
        this instanceof HTMLCanvasElement &&
        this.getAttribute('aria-label') === expectedCanvasName
      ) {
        captureState.count += 1;
      }

      return originalSetPointerCapture.call(this, pointerId);
    };
  }, canvasName);

  await page.goto('/');
  const startButton = page.getByRole('button', { exact: true, name: 'Start' });
  await expect(startButton).toBeVisible();
  await expect(startButton).toBeEnabled({ timeout: 30_000 });
  await page.keyboard.press('Enter');
  await expect(page.locator('body')).not.toHaveClass(/is-loading/, {
    timeout: 30_000,
  });

  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('toolbar', { name: 'Garden toolbar' })).toBeVisible();

  const canvas = page.getByRole('img', { name: canvasName });
  await expect(canvas).toBeVisible();
  const canvasSize = await canvas.evaluate((element) => {
    const canvasElement = element as HTMLCanvasElement;
    return {
      height: canvasElement.height,
      width: canvasElement.width,
    };
  });
  expect(canvasSize.width).toBeGreaterThan(0);
  expect(canvasSize.height).toBeGreaterThan(0);

  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  if (!box) {
    return;
  }

  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.5, {
    steps: 16,
  });
  await page.mouse.up();

  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as unknown as {
              __fleetingGardenPointerCaptures?: { count: number };
            }
          ).__fleetingGardenPointerCaptures?.count ?? 0
      )
    )
    .toBeGreaterThan(0);

  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as unknown as {
              __fleetingGardenBrushPasses?: number;
            }
          ).__fleetingGardenBrushPasses ?? 0
      )
    )
    .toBeGreaterThan(0);
});

test('shows a clear fallback when WebGPU is unavailable', async ({ page }) => {
  await disableWebGpu(page);
  await page.goto('/');

  await expect(page).toHaveTitle('Fleeting Garden');
  await expect(page.getByRole('img', { name: canvasName })).toBeVisible();
  await expect(page.getByRole('toolbar', { name: 'Garden toolbar' })).toBeVisible();
  await expect(page.locator('body')).not.toHaveClass(/is-loading/);

  const fallback = page.getByRole('alert');
  await expect(fallback).toContainText('Fleeting Garden needs WebGPU');
  await expect(fallback).toContainText('webgpu-unsupported');
});

test('syncs the selected vibe with the URI', async ({ page }) => {
  await disableWebGpu(page);
  await page.goto('/?vibe=Aurora%20Mycelium');

  await expect(page).toHaveURL(/vibe=aurora-mycelium/);

  await page.getByRole('button', { name: 'Next vibe' }).click();
  await expect(page).toHaveURL(/vibe=velvet-observatory/);

  await page.goBack();
  await expect(page).toHaveURL(/vibe=aurora-mycelium/);
});

test('keeps audio focus outlines scoped to the active control', async ({ page }) => {
  await disableWebGpu(page);
  await page.goto('/');
  await expect(page.locator('body')).not.toHaveClass(/is-loading/);

  const audioControl = page.locator('.audio-control');
  const soundButton = page.getByRole('button', { name: /audio/i });
  const volumeSlider = page.getByRole('slider', { name: 'Master volume' });

  await soundButton.click();
  await expect(audioControl).toHaveCSS('outline-style', 'none');
  await expect(soundButton).toHaveCSS('outline-style', 'none');

  await page.mouse.click(10, 10);
  for (let tabIndex = 0; tabIndex < 12; tabIndex += 1) {
    await page.keyboard.press('Tab');
    const activeClass = await page.evaluate(() =>
      String(document.activeElement?.className ?? '')
    );
    if (activeClass.includes('sound')) {
      break;
    }
  }

  await expect(soundButton).toBeFocused();
  await expect(soundButton).toHaveCSS('outline-style', 'solid');
  await expect(soundButton).toHaveCSS('outline-offset', '-4px');

  await page.keyboard.press('Tab');
  await expect(volumeSlider).toBeFocused();
  await expect(volumeSlider).toHaveCSS('outline-style', 'solid');
  await expect(volumeSlider).toHaveCSS('outline-offset', '-4px');
});

test('keeps the config overlay scrollable and dismissible on mobile', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 640 });
  await page.goto('/');

  const startButton = page.getByRole('button', { exact: true, name: 'Start' });
  await expect(startButton).toBeEnabled({ timeout: 30_000 });
  await startButton.click();
  await expect(page.locator('body')).not.toHaveClass(/is-loading/, {
    timeout: 30_000,
  });

  const settingsButton = page.getByRole('button', { name: 'Show config overlay' });
  await settingsButton.click();

  const pane = page.locator('.config-pane');
  const closeButton = page.locator('.config-pane-close');
  await expect(pane).toBeVisible();
  await expect(closeButton).toBeVisible();

  const paneMetrics = await pane.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    return {
      bottom: rect.bottom,
      clientHeight: element.clientHeight,
      overflowY: style.overflowY,
      scrollHeight: element.scrollHeight,
      top: rect.top,
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth,
      width: rect.width,
    };
  });

  expect(paneMetrics.top).toBeGreaterThanOrEqual(0);
  expect(paneMetrics.bottom).toBeLessThanOrEqual(paneMetrics.viewportHeight);
  expect(Math.round(paneMetrics.width)).toBe(Math.round(paneMetrics.viewportWidth * 0.8));
  expect(paneMetrics.scrollHeight).toBeGreaterThan(paneMetrics.clientHeight);
  expect(['auto', 'scroll']).toContain(paneMetrics.overflowY);

  await pane.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect
    .poll(() => pane.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0);

  await closeButton.click();
  await expect(pane).toBeHidden();
  await expect(settingsButton).toHaveAttribute('aria-expanded', 'false');
});
