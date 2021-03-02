import { mkdirSync, readFileSync, rmdirSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import shell from 'shelljs';
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import { watch } from 'chokidar';

const CACHE_FOLDER = resolve(__dirname, `..`, `__cache__`);
const CACHE_PROJECT = resolve(CACHE_FOLDER, 'project');
const SCRIPT_PATH = resolve(CACHE_FOLDER, '../index.ts');

beforeAll(() => {
  mkdirSync(CACHE_FOLDER, { recursive: true });
  shell.exec(`npx tsc --outDir ${CACHE_FOLDER}`);
});

afterAll(() => {
  rmdirSync(CACHE_FOLDER, { recursive: true });
});

beforeEach(() => {
  mkdirSync(CACHE_PROJECT, { recursive: true });
});

afterEach(() => {
  rmdirSync(CACHE_PROJECT, { recursive: true });
});

function runScript(script: string, options = { async: false }) {
  return shell.exec(script, { silent: true, async: options.async });
}

test('required csproj', () => {
  const { stderr } = runScript(`ts-node ${SCRIPT_PATH} --pattern test`);
  expect(shell.error()).toBeTruthy();
  expect(stderr).toContain('Expected csproj');
});

test('required pattern', () => {
  const { stderr } = runScript(`ts-node ${SCRIPT_PATH} --csproj dummy`);
  expect(shell.error()).toBeTruthy();
  expect(stderr).toContain('Expected pattern');
});

test('accept only csproj extension', () => {
  const { stderr } = runScript(
    `ts-node ${SCRIPT_PATH} --csproj dummy --pattern test`,
  );
  expect(shell.error()).toBeTruthy();
  expect(stderr).toContain('Expected .csproj file');
});

function startScript() {
  let resolveReady: Function;
  let resolveError: Function;
  let process: ChildProcessWithoutNullStreams;
  const status = {
    ready: new Promise((resolve) => (resolveReady = resolve)),
    error: new Promise((resolve) => (resolveError = resolve)),
    kill: () => process.kill(),
  };
  process = spawn('ts-node', [
    SCRIPT_PATH,
    '--csproj',
    'src/__cache__/project/MyProject.csproj',
    '--pattern',
    `*.ts`,
    '--onReady',
    'echo SCRIPT_READY',
  ]);
  process.stdout.on('data', (data) => {
    if (data.toString().includes('SCRIPT_READY')) {
      resolveReady();
      return;
    }
  });
  process.stderr.on('data', (err) => {
    resolveError();
  });
  return status;
}

interface WaitForCbData {
  type: 'change' | 'add' | 'remove';
  content: string;
}

function waitFor(
  filePath: string,
  cb: (status: WaitForCbData) => boolean,
): Promise<null> {
  return new Promise((resolve) => {
    const watcher = watch(filePath).on('change', () => {
      const pass = cb({
        type: 'change',
        get content() {
          return readFileSync(filePath, 'utf-8');
        },
      });
      if (!pass) return;
      watcher.close();
      resolve(null);
    });
  });
}

test('required valid csproj file', async () => {
  const csprojName = 'MyProject.csproj';
  const csprojPath = resolve(`${CACHE_PROJECT}`, csprojName);
  writeFileSync(csprojPath, '<Project></Project>');
  const { kill, ready, error } = startScript();
  await ready;
  const scriptName = 'myscript.ts';
  writeFileSync(resolve(`${CACHE_PROJECT}`, scriptName), '');
  await waitFor(
    csprojPath,
    ({ type, content }) => type === 'change' && content.includes(scriptName),
  );
  expect(readFileSync(csprojPath, 'utf-8')).toMatchInlineSnapshot(`
    "<Project>
        <ItemGroup>
            <Content Include=\\"myscript.ts\\"/>
        </ItemGroup>
    </Project>"
  `);
  kill();
});
