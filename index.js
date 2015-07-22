var mc = require('manticore');

var pool = mc.createPool({
    worker: require.resolve('./worker'),
    concurrent: 4
});

var articles =[
  'pinchofyum',
  'pinchofyum2',
  'techcrunch',
  'cnn'
];

var start = Date.now();

Promise.all(articles.map(function (article) {
  return pool.run('process_articles', [article]);
})).then(function(results) {
  console.log('Processing took', (Date.now() - start) / 1000, 'seconds');
});
