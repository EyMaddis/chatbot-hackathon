'use strict';
const Botkit = require('botkit');
const request = require('request-promise'); // for external API/HTTP requests
const querystring = require('querystring');
const co = require('co');
const _ = require('lodash');
const util = require('util');

const movieDBURL = 'https://api.themoviedb.org/3/';

if (!process.env.token || !process.env.moviedb_key) {
  console.log('Error: Specify token in environment and moviedb_key');
  process.exit(1);
}

const controller = Botkit.slackbot({
 debug: false
});

controller.spawn({
  token: process.env.token
}).startRTM(function(err) {
  if (err) {
    throw new Error(err);
  }
});

controller.hears(['from (.+)'],['direct_message','direct_mention','mention'],function(bot,message) {
    console.log('got request', message);
    bot.reply(message, 'trying my best');

    co(handleRequest(message)).then(replyWithMovies)
    .catch((err) => {
            console.error('oh no', err, err.stack);
        bot.reply(message, 'oh no, I failed with my request');
    });

    function replyWithMovies(movies) {
        if(!movies || !movies.length) {
            bot.reply(message, 'no results found :(')
            return;
        }


        bot.reply(message, 'I found the following movies');
        movies.forEach((movie) => {
            bot.reply(message, formatMovie(movie));
        });
    }
});

function* handleRequest(message){
    const results = yield getFromMovieDB('search/person', {
            query: message.match[1],
            'sort_by': 'popularity.desc'
        })
    if(results.total_results <= 0) {
        return; // no result
    }
    const people = results.results;

    if(people.length > 1) {
        // TODO: did you mean?
    }

    console.log('found people', typeof people);

    const personId = people[0].id
    const movies = yield getFromMovieDB('discover/movie', {
        with_people: personId
    });
    return _.get(movies, 'results');

}


function getFromMovieDB(urlPart, query) {
    console.log('starting request', urlPart, query,getMovieDBUrl(urlPart, query));
    return request({
        uri: getMovieDBUrl(urlPart, query),
        json: true
    });
}

function getMovieDBUrl(urlPart, query) {
    query = query || {};
    query['api_key'] = process.env.moviedb_key;
    return `${movieDBURL}${urlPart}?${querystring.stringify(query)}`;
}

function formatMovie(movie) {
    const year = movie.release_date.split('-')[0];
    return `*${movie.title}* (_${year}_): \n ${movie.overview}`;
}