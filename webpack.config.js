const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const TerserPlugin = require('terser-webpack-plugin');
const InlineSourceWebpackPlugin = require('inline-source-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');

module.exports = (env, argv) => ({
  devtool: argv.mode === 'development' ? 'inline-source-map' : false,
  entry: {
    index: './src/index.ts',
  },
  watchOptions: {
    ignored: '**/node_modules',
  },
  optimization: {
    minimizer: [
      new TerserPlugin({
        terserOptions: {
          module: true,
        },
      }),
    ],
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './src/index.html',
    }),
    new MiniCssExtractPlugin(),
    argv.mode === 'production'
      ? new InlineSourceWebpackPlugin({
          compress: true,
        })
      : null,
    new (require('webpack').DefinePlugin)({
      __CURRENT_DATE__: Date.now(),
    }),
  ].filter(Boolean),
  module: {
    rules: [
      {
        test: /\.svg$/i,
        use: 'svg-inline-loader',
      },
      {
        test: /\.wgsl/,
        type: 'asset/source',
        generator: {
          filename: '[name][ext]',
        },
      },
      {
        test: /\/no-change\//i,
        type: 'asset/resource',
        generator: {
          filename: '[name][ext]',
        },
      },
      {
        test: /\.scss$/i,
        use: [
          MiniCssExtractPlugin.loader,
          'css-loader',
          'resolve-url-loader',
          {
            loader: 'sass-loader',
            options: {
              sourceMap: true, // required by resolve-url-loader
            },
          },
        ],
      },
      {
        test: /\.ts$/,
        use: 'ts-loader',
      },
    ],
  },
  resolve: {
    extensions: [
      '.ts',
      '.js', // required for development
    ],
  },
  output: {
    clean: true,
    filename: '[name].js',
    path: path.resolve(__dirname, 'dist'),
    publicPath: '',
  },
});
