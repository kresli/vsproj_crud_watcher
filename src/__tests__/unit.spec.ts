import {
  mkdirSync,
  readFileSync,
  renameSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from 'fs';
import { resolve } from 'path';
import { watchProject } from '../watcher';
import { watch } from 'chokidar';
import { mv } from 'shelljs';
const CACHE_PROJECT = `src/__cache__`;

beforeEach(() => {
  rmdirSync(CACHE_PROJECT, { recursive: true });
});
afterAll(() => {
  rmdirSync(CACHE_PROJECT, { recursive: true });
});

async function waitForCsprojChange(
  projPath: string,
  cb: (content: string) => boolean,
): Promise<string> {
  const content = readFileSync(projPath, 'utf-8');
  if (cb(content)) return content;

  return new Promise((resolve) => {
    const watcher = watch(projPath, {
      persistent: true,
    }).on('change', () => {
      const content = readFileSync(projPath, 'utf-8');
      const pass = cb(content);
      if (!pass) return;
      watcher.close();
      resolve(content);
    });
  });
}

function createProject(content = '<Project></Project>') {
  mkdirSync(CACHE_PROJECT, { recursive: true });
  const projPath = resolve(CACHE_PROJECT, 'Project.csproj');
  writeFileSync(projPath, content);
  return {
    projPath,
    waitForCsprojChange: (cb: (content: string) => boolean) =>
      waitForCsprojChange(projPath, cb),
  };
}
function createFile(path: string, content: string) {
  writeFileSync(resolve(CACHE_PROJECT, path), content);
}
function deleteFile(path: string) {
  unlinkSync(resolve(CACHE_PROJECT, path));
}

function renameFile(originalPath: string, targetPath: string) {
  mv(resolve(CACHE_PROJECT, originalPath), resolve(CACHE_PROJECT, targetPath));
}

test('add', async () => {
  const { projPath, waitForCsprojChange } = createProject();
  const close = await watchProject({ projPath, pattern: '*.ts' });
  expect(readFileSync(projPath, 'utf-8')).not.toContain('test.ts');
  createFile('test.ts', '');
  const content = await waitForCsprojChange((content) =>
    content.includes('test.ts'),
  );
  expect(content).toMatchInlineSnapshot(`
    "<Project>
        <ItemGroup>
            <Content Include=\\"test.ts\\"/>
        </ItemGroup>
    </Project>"
  `);
  await close();
});

test('remove', async () => {
  const { projPath, waitForCsprojChange } = createProject(
    `<Project><ItemGroup><Content Include="test.ts"/></ItemGroup></Project>`,
  );
  createFile('test.ts', '');
  const close = await watchProject({ projPath, pattern: '*.ts' });
  deleteFile('test.ts');
  const content = await waitForCsprojChange(
    (content) => !content.includes('test.ts'),
  );
  expect(content).toMatchInlineSnapshot(`"<Project/>"`);
  await close();
});

test('rename', async () => {
  const { projPath, waitForCsprojChange } = createProject(
    `<Project><ItemGroup><Content Include="test.ts"/></ItemGroup></Project>`,
  );
  createFile('test.ts', '');
  const close = await watchProject({ projPath, pattern: '*.ts' });
  renameFile('test.ts', 'foo.ts');
  await waitForCsprojChange((content) => content.includes('foo.ts'));
  const content = await waitForCsprojChange(
    (content) => !content.includes('test.ts'),
  );
  expect(content).toMatchInlineSnapshot(`
  "<Project>
      <ItemGroup>
          <Content Include=\\"foo.ts\\"/>
      </ItemGroup>
  </Project>"
`);
  await close();
});
