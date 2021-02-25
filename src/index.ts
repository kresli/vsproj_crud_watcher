// node crud_watcher --extensions=ts,html,css,scss,xml --csproj=
// watch for all ts, html, css, scss, xml

import { watch } from 'chokidar';
import yargs from 'yargs';
import { readFileSync, writeFileSync } from 'fs';
import { extname } from 'path';
import { xml2js, js2xml, Element } from 'xml-js';

const argv = {
  csproj: '',
  pattern: '',
  ...yargs(process.argv).argv,
};

interface FlatElement {
  current: Element;
  parent: Element;
}

function getFlatElementReferences(element: Element): FlatElement[] {
  const elements =
    element.elements?.map((el) => ({
      current: el,
      parent: element,
    })) || [];
  const children = (element.elements?.map(getFlatElementReferences).flat() ||
    []) as FlatElement[];
  return [...elements, ...children];
}

function findContainerElement(
  elements: FlatElement[],
  ext: string,
): Element | null {
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

function writeProj(projPath: string, proj: Element) {
  writeFileSync(projPath, js2xml(proj, { spaces: 4 }));
}

function createContent(projPath: string, filePath: string) {
  const proj = xml2js(readFileSync(projPath, 'utf-8')) as Element;
  const elements = getFlatElementReferences(proj);
  if (pathExist(elements, filePath)) return;
  const ext = extname(filePath);
  let container = findContainerElement(elements, ext);
  if (!container) {
    const element = {
      type: 'element',
      name: 'ItemGroup',
    };
    proj.elements = [...(proj.elements || []), element];
    container = element;
  }
  container.elements = [
    ...(container.elements || []),
    {
      type: 'element',
      name: 'Content',
      attributes: {
        Include: filePath,
      },
    },
  ];
  writeProj(projPath, proj);
}

function deleteContent(projPath: string, filePath: string) {
  const proj = xml2js(readFileSync(projPath, 'utf-8')) as Element;
  const elements = getFlatElementReferences(proj);
  const elem = elements.find(({ current }) => {
    const { type, name, attributes } = current;
    return (
      type === 'element' &&
      name === 'Content' &&
      attributes?.Include == filePath
    );
  });
  if (!elem?.parent?.elements) return;
  const parentElements = elem.parent.elements;
  parentElements.splice(parentElements.indexOf(elem.current), 1);
  writeProj(projPath, proj);
}

function start(projPath?: string, pattern?: string) {
  if (!projPath) throw new Error(`Expected csproj`);
  if (!pattern) throw new Error(`Expected pattern`);
  console.log(`CRUD watcher start on "${projPath}" watching "${pattern}"`);
  const watcher = watch(pattern, {
    ignored: ['node_modules', projPath],
    persistent: true,
  });
  watcher
    .on('add', (path) => createContent(projPath, path))
    .on('unlink', (path) => deleteContent(projPath, path));
}

start(argv.csproj, argv.pattern);
