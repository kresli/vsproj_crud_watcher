const path = require('path');
module.exports = {
  entry: './src/index.ts',
  output: {
    filename: 'vsproj_crud_watcher.js', // <-- Important
    libraryTarget: 'this', // <-- Important
    path: path.resolve(__dirname, 'dist'),
    clean: true,
  },
  target: 'node', // <-- Important
  module: {
    rules: [
      {
        test: /\.ts$/,
        loader: 'ts-loader',
        options: {
          transpileOnly: true,
        },
      },
    ],
  },
  resolve: {
    extensions: ['.ts', '.js'],
  },
};
