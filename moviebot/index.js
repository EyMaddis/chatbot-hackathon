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
    bot.startConversation(message, startConversation(message))
});


function startConversation(message) {
    return (response, conversation) => {
        if(response !== null) {
            console.error('response not null', response);
            throw 'response not null'
        }
        console.log('conversation!', conversation);
        co(handleRequest(message)).then(replyWithMovies)
        .catch((err) => {
                console.error('oh no', err, err.stack);
            conversation.say('oh no, I failed with my request');
            conversation.next();
        });

        function replyWithMovies(movies) {
            if(!movies || !movies.length) {
                conversation.say('no results found :(')
                conversation.next();
                return;
            }


            conversation.say('I found the following movies');
            conversation.next();
            movies.forEach((movie) => {
                conversation.say(formatMovie(movie));
                conversation.next();
            });
        }
    };
};

function* handleRequest(message){
    const results = yield getFromMovieDB('search/person', {
            query: message.match[1],
            'sort_by': 'popularity.desc'
        })
    if(results.total_results <= 0) {
        return; // no result
    }
    const people = results.results;


    // yield* selectPerson(message, people);

    console.log('found people', typeof people);

    const personId = people[0].id
    const movies = yield getFromMovieDB('discover/movie', {
        with_people: personId
    });
    return _.get(movies, 'results');

}

// function* selectPerson(message, people) {
//     if(people.length == 1) {
//         return people[0];
//     } else {
//         // did you mean XY - known for movie3? Conversation
//         yield new Promise((resolve, reject) => {

//         });
//     }
// }


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