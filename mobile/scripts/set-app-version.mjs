import { readFile, writeFile } from 'node:fs/promises';
import process from 'node:process';
import { createInterface } from 'node:readline/promises';

const appJsonUrl = new URL('../app.json', import.meta.url);
const versionPattern = /^\d+(?:\.\d+){0,2}$/;

function compareVersions(left, right) {
  const leftParts = left.split('.').map(Number);
  const rightParts = right.split('.').map(Number);

  for (let index = 0; index < 3; index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) {
      return difference;
    }
  }

  return 0;
}

async function askVersion(currentVersion) {
  if (!process.stdin.isTTY) {
    throw new Error('대화형 터미널이 아닙니다. npm run app-version -- 1.0.1 형식으로 입력해 주세요.');
  }

  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await prompt.question(`새 앱 버전 (현재 ${currentVersion}, 예: 1.0.1): `);
  } finally {
    prompt.close();
  }
}

async function main() {
  if (process.argv[2] === '--help' || process.argv[2] === '-h') {
    console.log('사용법: npm run app-version 또는 npm run app-version -- 1.0.1');
    return;
  }

  const raw = await readFile(appJsonUrl, 'utf8');
  const config = JSON.parse(raw);
  const currentVersion = config.expo?.version;

  if (typeof currentVersion !== 'string' || !versionPattern.test(currentVersion)) {
    throw new Error('app.json의 expo.version을 확인할 수 없습니다.');
  }

  const requestedVersion = process.argv[2] ?? (await askVersion(currentVersion));
  const nextVersion = requestedVersion.trim();

  if (!versionPattern.test(nextVersion)) {
    throw new Error('앱 버전은 1, 1.1, 1.0.1처럼 숫자와 점으로 입력해 주세요.');
  }
  if (compareVersions(nextVersion, currentVersion) <= 0) {
    throw new Error(`새 앱 버전은 현재 버전 ${currentVersion}보다 높아야 합니다.`);
  }

  config.expo.version = nextVersion;
  await writeFile(appJsonUrl, `${JSON.stringify(config, null, 2)}\n`, 'utf8');

  console.log(`앱 버전 변경 완료: ${currentVersion} → ${nextVersion}`);
  console.log('이제 EAS production 빌드를 실행해 주세요.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
