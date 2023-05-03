import * as fs from "fs";
import { WritableStream } from "node:stream/web";

import { chromium } from "playwright-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { Configuration, OpenAIApi } from "openai";

chromium.use(StealthPlugin());

const configuration = new Configuration({
  organization: process.env.ORG, // optional
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

const downloadFile = async (audioLink: string) => {
  const downlaodWriteStream = fs.createWriteStream("audio.mp3");

  const stream = new WritableStream({
    write(chunk) {
      downlaodWriteStream.write(chunk);
    },
  });

  const response = await fetch(audioLink);
  await response.body?.pipeTo(stream);
};

// randomSecond 1 ~ 5 
const randomSecond = Math.round(Math.random() * 4000) + 1000;

(async () => {
  const browser = await chromium.launch({ headless: false, timeout: 30 * 60 * 1000});
  const context = await browser.newContext();
  const page = await context.newPage();

  // The actual interesting bit
  await context.route("**.jpg", (route) => route.abort());
  const recaptchaDemoUrl = "https://www.google.com/recaptcha/api2/demo";
  // const recaptchaDemoUrl = "https://www.railway.gov.tw/tra-tip-web/tip/tip001/tip121/query";
  await page.goto(recaptchaDemoUrl);
  await page.waitForTimeout(randomSecond);

  // click checkbox
  const iframeLocator = page
    .frameLocator('iframe[src^="https://www.google.com/recaptcha/"]')
    .first();
  await iframeLocator.locator("#recaptcha-anchor").click();
  await page.waitForTimeout(randomSecond);

  // request audio
  const iframeChallengeLocator = page
    .frameLocator(
      'iframe[src^="https://www.google.com/recaptcha/"][src*="bframe"]'
    )
    .first();
  await iframeChallengeLocator.locator("#recaptcha-audio-button").click();
  await page.waitForTimeout(randomSecond);

  // solve audio captcha
  const audioSrc = await iframeChallengeLocator
    .locator("#audio-source")
    .getAttribute("src");
  if (!audioSrc) {
    console.error("Audio source not found !");
    await context.close();
    await browser.close();
    return;
  }

  await downloadFile(audioSrc);
  console.log('download finished')
  await page.waitForTimeout(randomSecond);

  const file = fs.createReadStream("./audio.mp3");
  let audioText;
  try {
    // @ts-ignore
    const res = await openai.createTranscription(file, "whisper-1");
    audioText = res.data.text;
    console.log('audioText', audioText)
  } catch (err) {
    console.error(err);
  }

  if (!audioText) {
    console.error("Didn't solve the audio text !")
    await context.close();
    await browser.close();
    return;
  }

  await iframeChallengeLocator
    .locator("input#audio-response")
    .fill(audioText);
  await page.waitForTimeout(randomSecond);

  await iframeChallengeLocator.locator('#recaptcha-verify-button').click()
  await page.waitForTimeout(randomSecond);
  // await context.close();
  // await browser.close();
})();
