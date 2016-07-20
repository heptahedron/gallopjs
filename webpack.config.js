const context = __dirname + '/src',
      entry   = './gllpc',
      path    = __dirname + '/dist',
      filename = 'gllpc.js'

module.exports = {
  context,
  entry,
  target: 'node',
  output: {
    path,
    filename,
    library: 'gllpc',
    libraryTarget: 'commonjs2'
  },
  module: {
    loaders: [
      {
        test: /\.js$/,
        loader: 'babel'
      }
    ]
  }
}
