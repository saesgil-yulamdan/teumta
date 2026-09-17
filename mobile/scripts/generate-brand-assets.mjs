import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

// 모든 앱 로고의 원본. 디자인을 바꾸면 루트 SVG를 수정한 뒤 이 스크립트를 실행한다.
const sourceUrl = new URL('../../teumta-logo-2026-v2.svg', import.meta.url);
const outputUrl = new URL('../assets/images/', import.meta.url);
const svg = await readFile(sourceUrl, 'utf8');
const output = (name) => fileURLToPath(new URL(name, outputUrl));
const render = (source, size) => sharp(Buffer.from(source), { density: 576 }).resize(size, size).png();

await mkdir(outputUrl, { recursive: true });
await copyFile(sourceUrl, new URL('teumta-logo.svg', outputUrl));

// 스토어 아이콘은 불투명하게, 화면 내부와 스플래시 로고는 투명 배경으로 만든다.
await render(svg, 1024).flatten({ background: '#FFFFFF' }).toFile(output('icon.png'));
await render(svg, 512).toFile(output('splash-icon.png'));
await render(svg, 64).toFile(output('favicon.png'));

// Android의 원형·사각형 마스크 안에 로고 전체가 들어가도록 전경에 여유를 둔다.
const foreground = await render(svg, 640).toBuffer();
const monochrome = await render(svg.replace(/#[0-9a-f]{6}/gi, '#000000'), 640).toBuffer();
for (const [name, input] of [
  ['android-icon-foreground.png', foreground],
  ['android-icon-monochrome.png', monochrome],
]) {
  await sharp({ create: { width: 1024, height: 1024, channels: 4, background: '#00000000' } })
    .composite([{ input, gravity: 'centre' }]).png().toFile(output(name));
}
await sharp({ create: { width: 1024, height: 1024, channels: 3, background: '#FFFFFF' } })
  .png().toFile(output('android-icon-background.png'));

console.log('v2 SVG에서 앱 로고·아이콘·스플래시·파비콘을 생성했습니다.');
