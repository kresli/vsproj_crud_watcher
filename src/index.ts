import { watchProject } from './watcher';
import yargs from 'yargs';

const argv = {
  csproj: '',
  pattern: '',
  onReady: undefined,
  ...yargs(process.argv).argv,
};

watchProject({
  projPath: argv.csproj,
  pattern: argv.pattern,
  onReady: argv.onReady,
});
