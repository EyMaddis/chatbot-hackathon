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
 debug: true
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

    co(function*(){
        const results = yield getFromMovieDB('search/person', {
                query: message.match[1],
                'sort_by': 'popularity.desc'
            })
        if(results.total_results <= 0) {
            return; // no result
        }
        const people = results.results;
        console.log('found people', typeof people);
        const personId = people[0].id
        const movies = yield getFromMovieDB('discover/movie', {
            with_people: personId
        });
        return _.get(movies, 'results');

    }).then(replyWithMovies).catch((err) => {
            console.error('oh no', err, err.stack);
        bot.reply(message, 'oh no, I failed with my request');
    });

    function replyWithMovies(movies) {
        if(!movies || !movies.length) {
            bot.reply(message, 'no results found :(')
            return;
        }
        const reply = {
            text: 'I found these movies',
            attachments: {
                title: 'Your results ordered',
                fields: movies.map(movie => {
                    console.log('movie', movie.title);
                    return {
                        label: movie.title,
                        value: movie.overview,
                        color: '#FFCC99',
                        short: false
                    }
                }).slice(0, 3)
            }
        };
        console.log('reply', util.inspect(reply, true, 5, true));
        bot.reply(message, reply);
    }
    // const attachments = [];
    // const attachment = {
    //   title: 'This is an attachment',
    //   color: '#FFCC99',
    //   fields: [],
    // };

    // attachment.fields.push({
    //   label: 'Field',
    //   value: 'A longish value',
    //   short: false,
    // });

    // attachment.fields.push({
    //   label: 'Field',
    //   value: 'Value',
    //   short: true,
    // });

    // attachment.fields.push({
    //   label: 'Field',
    //   value: 'Value',
    //   short: true,
    // });

    // attachments.push(attachment);

    // bot.reply(message,{
    // text: 'See below...',
    // attachments: attachments,
    // },function(err,resp) {
    // console.log(err,resp);
    // });
});

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