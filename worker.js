var wordNet = require('wordnet-magic');
var Promise = require("bluebird");
var _ = require('lodash');
var util = require('util');
var mc = require('manticore');

var win = {
  log: function (str) {
    console.log(str);
    return str;
  },
  bench: function (func, type) {
    var start = Date.now();
    func();
    var end = Date.now();
    console.log(type, 'in', end - start, 'ms');
  },
  async_bench: function  (type) {
    var start = Date.now();
    return function () {
      var end = Date.now();
      console.log(type, 'in', end - start, 'ms');
    };
  },
  str: {
    only_alpha: function (str) {
      return str.replace(/[^a-zA-Z\d:]/g, '');
    },
    lowercase: function (str) {
      return str.toLowerCase();
    }
  },
  net: {
    make_word: function (str) {
      return new wn.Word(str);
    },
    synsets: function (word) {
      return word.getSynsets(function () {

      });
    }
  },
  blacklist: [
    'adj.all',
    'adv.all',
    'noun.artifact',
    'verb.change',
    'verb.stative'
  ]
};

var total_bench = win.async_bench('Total Program Runtime');
var wn = null;

win.bench(function () {
  wn = wordNet('data/sqlite-31.db', true);
}, 'Wordnet Loading DB');

var fs = Promise.promisifyAll(require("fs"));

var lookup_bench = win.async_bench('Wordnet Lookup');

function input_file (file_path) {
  return fs.readFileAsync(file_path, 'utf8').then(function (text) {
    var words = _.chain(text)
      .words(/[^, -]+/g)
      .map(win.str.only_alpha)
      .map(win.str.lowercase)
      .compact()
      .map(win.net.make_word)
      .value();

    return words;
  });
}

function input_str (str) {
  return Promise.promisify(str).then(function (text) {
    var words = _.chain(text)
      .words(/[^, -]+/g)
      .map(win.str.only_alpha)
      .map(win.str.lowercase)
      .compact()
      .map(win.net.make_word)
      .value();

    return words;
  });
}

function process (words) {
  words.get('length').then(function (length) {
    console.log('Processing', length, 'words');
  });

  return words.map(function (word) {
    return Promise.fromNode(function(callback) {
      word.getSynsets(function (err, synsets) {
        if (synsets) {
          callback(err, synsets.map(function (synset) {
            synset.word = word;
            return synset;
          }));
        }
        else {
          callback(null, []);
        }
      });
    });
  }).all().then(function (data) {
    var lexicaldomains = data.reduce(function (acc, arr) {
      return acc.concat(arr);
    }, []).reduce(function (lexdomains, synset) {
      lexdomains[synset.lexdomain] = lexdomains[synset.lexdomain] || {
        count: 0,
        items: [],
        words: []
      };

      lexdomains[synset.lexdomain].count++;
      lexdomains[synset.lexdomain].items = lexdomains[synset.lexdomain].items.concat(synset.words.map(function (word) {
        return word.lemma;
      }));

      lexdomains[synset.lexdomain].words.push(synset.word.lemma);

      return lexdomains;
    }, {});

    var results = _.chain(lexicaldomains).map(function (val, key) {
      return {
        type: key,
        count: val.count,
        items: val.items,
        words: val.words
      };
    }).sortBy('count').reverse().map(function (result) {
      result.items = _.sortBy(_.uniq(result.items));
      result.words = _.sortBy(_.uniq(result.words));
      return result;
    }).reduce(function (acc, result) {
      if (result.type.indexOf(win.blacklist) === -1) {
        acc.push(result);
      }
      return acc;
    }, []).value();

    return results;
  });
}

function process_articles (article) {
  return process(input_file('articles/' + article + '.txt')).then(function (results) {
    console.log(results.length, 'results for', article);
    lookup_bench();
    return results;
  }).then(function (results) {
    return fs.writeFileAsync('output/' + article + '.json', JSON.stringify(results, null, 2));
  });
}

var win_worker = {
  process_articles: process_articles
};

mc.registerTasks(win_worker);

module.exports = win_worker;
