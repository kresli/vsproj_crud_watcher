import { watch } from 'chokidar';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { extname, resolve, dirname } from 'path';
import { xml2js, js2xml, Element } from 'xml-js';
import { exec } from 'shelljs';

interface FlatElement {
  current: Element;
  parent: FlatElement | null;
}

function getFlatElementReferences(element: FlatElement): FlatElement[] {
  const elements =
    element.current.elements?.map((el) => ({
      current: el,
      parent: element,
    })) || [];
  const children = (element.current.elements
    ?.map((current) => getFlatElementReferences({ current, parent: element }))
    .flat() || []) as FlatElement[];
  return [...elements, ...children];
}

function findContainerElement(
  elements: FlatElement[],
  ext: string,
): FlatElement | null {
  return (
    elements.find(({ current }) => {
      const { type, name, attributes } = current;
      return (
        type === 'element' &&
        name === 'Content' &&
        attributes?.Include &&
        extname(`${attributes.Include}`) === ext
      );
    })?.parent || null
  );
}

function pathExist(elements: FlatElement[], path: string) {
  return elements.some(
    ({ current: { attributes, name, type } }) =>
      type === 'element' && name === 'Content' && attributes?.Include === path,
  );
}

function escapeChars(source: string) {
  return source.replace(/&/g, '&amp;');
}

function writeProj(projPath: string, proj: Element) {
  writeFileSync(projPath, escapeChars(js2xml(proj, { spaces: 4 })));
}

function createContent(config: { csprojPathAbs: string; filePathAbs: string }) {
  const { csprojPathAbs, filePathAbs } = config;
  const raw = xml2js(readFileSync(csprojPathAbs, 'utf-8')) as Element;
  const elements = getFlatElementReferences({
    current: raw,
    parent: null,
  });
  const proj = elements.find((el) => !el.parent?.parent)!;
  const relativePath = filePathAbs
    .replace(dirname(csprojPathAbs), '')
    .substring(1);
  if (pathExist(elements, relativePath)) return;
  const ext = extname(relativePath);
  let container = findContainerElement(elements, ext);
  if (!container) {
    const element = {
      type: 'element',
      name: 'ItemGroup',
    };
    proj.current.elements = [...(proj.current.elements || []), element];
    container = { current: element, parent: proj };
  }
  container.current.elements = [
    ...(container.current.elements || []),
    {
      type: 'element',
      name: 'Content',
      attributes: {
        Include: relativePath,
      },
    },
  ];
  writeProj(csprojPathAbs, { elements: [proj.current] });
}

function deleteContent(config: { csprojPathAbs: string; filePathAbs: string }) {
  const { csprojPathAbs, filePathAbs } = config;
  const elements = getFlatElementReferences({
    current: xml2js(readFileSync(csprojPathAbs, 'utf-8')) as Element,
    parent: null,
  });
  const proj = elements.find((el) => !el.parent?.parent)!;
  const relativePath = filePathAbs
    .replace(dirname(csprojPathAbs), '')
    .substring(1);
  const elem = elements.find(({ current }) => {
    const { type, name, attributes } = current;
    return (
      type === 'element' &&
      name === 'Content' &&
      attributes?.Include == relativePath
    );
  });
  if (!elem?.parent?.current.elements) return;
  const parentElements = elem.parent.current.elements;

  // if there is single element in ItemGroup we want to delete the whole ItemGroup
  const elementsArr =
    elem.parent.current.elements.length <= 1
      ? elem.parent.parent?.current.elements
      : elem.parent.current.elements;
  const elemRemove =
    elem.parent.current.elements.length <= 1
      ? elem.parent?.current
      : elem.current;
  elementsArr?.splice(elementsArr.indexOf(elemRemove), 1);
  writeProj(csprojPathAbs, { elements: [proj.current] });
}

interface WatchProjectConfig {
  projPath: string;
  pattern: string;
  onReady?: string;
  verbose?: boolean;
}

export async function watchProject(
  config: WatchProjectConfig,
): Promise<() => void> {
  try {
    const { projPath, pattern, onReady, verbose } = config;
    function logger(...args: any[]) {
      if (!verbose) return;
      console.log(...args);
    }
    if (!projPath) {
      process.stderr.write(`Expected csproj`);
      throw new Error('Expected');
    }
    const csprojPathAbs = resolve(process.cwd(), projPath);
    if (!existsSync(csprojPathAbs))
      throw new Error(`Invalid csproj path: ${csprojPathAbs}`);
    const wathcPath = `${dirname(csprojPathAbs)}/${pattern}`;
    const watcher = watch(wathcPath, {
      ignored: ['node_modules', csprojPathAbs],
      persistent: true,
    });
    await new Promise<null>((resolve) => {
      watcher
        .on('add', (filePathAbs) => {
          createContent({ csprojPathAbs, filePathAbs });
        })
        .on('unlink', (filePathAbs) =>
          deleteContent({ csprojPathAbs, filePathAbs }),
        )
        .on('ready', () => {
          resolve(null);
          console.log(
            `CRUD watcher start on "${projPath}" watching "${pattern}"`,
          );
        })
        .on('error', () => {
          console.log('error occured');
        });
    });
    if (onReady) {
      exec(onReady);
    }
    return () => watcher.close();
  } catch (e) {
    console.error(e);
    return () => {};
  }
}
