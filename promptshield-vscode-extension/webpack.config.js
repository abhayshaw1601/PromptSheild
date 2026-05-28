/* eslint-disable @typescript-eslint/no-var-requires */
const path = require("path");

/** @type {import("webpack").Configuration} */
module.exports = {
  target: "node",
  entry: "./src/extension.ts",
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "extension.js",
    libraryTarget: "commonjs2",
    clean: true
  },
  devtool: "source-map",
  externals: {
    vscode: "commonjs vscode"
  },
  resolve: {
    extensions: [".ts", ".js"],
    mainFields: ["module", "main"]
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: [
          {
            loader: "ts-loader",
            options: {
              compilerOptions: {
                sourceMap: true
              }
            }
          }
        ]
      }
    ]
  },
  optimization: {
    minimize: false
  },
  infrastructureLogging: {
    level: "log"
  }
};
