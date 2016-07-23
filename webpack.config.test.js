const context = __dirname + '/src/test',
      entry = './gllpc-unit-tests.js',
      path = __dirname + '/test',
      filename = 'all-tests.js'

module.exports = {
  context,
  entry,
  target: 'node',
  output: {
    path,
    filename
  },
  module: {
    loaders: [
      { test: /\.js$/,
        loader: 'babel',
        exclude: /node_modules/ }
    ]
  }
}
