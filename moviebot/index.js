'use strict';
const Botkit = require('botkit');
const request = require('request-promise'); // for external API/HTTP requests
const querystring = require('querystring');
const co = require('co');
const _ = require('lodash');
const util = require('util');

const movieDBURL = 'https://api.themoviedb.org/3/';
const witURL = 'https://api.wit.ai/message';

const SLACK_TOKEN = process.env.token;
const MOVIEDB_KEY = process.env.moviedb_key;
const WIT_KEY = process.env.wit_key;

if (!SLACK_TOKEN || !MOVIEDB_KEY || !WIT_KEY) {
  console.log('Error: Specify token, moviedb_key and wit_key in environment when starting the service');
  process.exit(1);
}

const controller = Botkit.slackbot({
 debug: false
});

controller.spawn({
  token: SLACK_TOKEN
}).startRTM(function(err) {
  if (err) {
    throw new Error(err);
  }
});

controller.hears(['(.*)'],['direct_message','direct_mention','mention'],function(bot,message) {
    console.log('got request', message);
    bot.reply(message, 'trying my best');
    bot.startConversation(message, startConversation(message))
});


function startConversation(message) {
    return (response, conversation) => {
        // const originalIsActive = conversation.task.isActive;
        // conversation.task.isActive = () => true;


        if(response !== null) {
            console.error('response not null', response);
            throw 'response not null'
        }

        co(handleRequest(conversation, message.match[1]))
            .then((movies) => {
                return co(replyWithMovies(conversation, movies));
            })
            .catch((err) => {
                console.error('oh no', err, err.stack);
                conversation.say('oh no, I failed with my request');
                conversation.next();
            });
    };
};

function* handleRequest(conversation, query){
    query = query.replace(/<\w*>/,'');
    console.log('HANDLE REQUEST 1', query);
    const witResponse = yield processLanguage(query);
    console.log('HANDLE REQUEST 2');

    // todo get actor from wit response
    const formattedWitResponse = formatWitResponse(witResponse);
    console.log('witResponse', formattedWitResponse, util.inspect(witResponse, true, 5, true));
    const actor = formattedWitResponse.directors[0]
    console.log('found actor', actor);

    const results = yield getFromMovieDB('search/person', {
            query: actor,
            'sort_by': 'popularity.desc'
        })
    if(results.total_results <= 0) {
        return; // no result
    }
    const people = results.results;


    const person = yield selectPerson(conversation, people);
    if(!person) {
        return; // no result
    }

    console.log('getting movies for', person.name);
    const moviesResult = yield getFromMovieDB('discover/movie', {
        with_people: person.id
    });
    const movies = _.get(moviesResult, 'results');
    console.log('found %d movies', movies && movies.length, moviesResult.total_results);
    return movies;
}

function* selectPerson(conversation, people) {
    if(people.length === 0) {
        console.log('no more people!');
        return;
    } else {
        // did you mean XY - known for movie3? Conversation
        const person = people.shift(); // shortens
        console.log('trying again! Checking', person);
        const foundPerson = yield askPerson(conversation, person);
        if(foundPerson) {
            return foundPerson;
        }
        console.log('trying again!');
        return yield selectPerson(conversation, people);
    }
}

function askPerson(conversation, person) {
    const knownFor = person.known_for
    let knownString = '';
    if(knownFor && knownFor.length > 0) {
        const titleList = knownFor.map(movie => `_${movie.title}_`).join(', ');
        knownString = `, known for ${titleList}`;
    }

    return new Promise((resolve) => {
        conversation.ask(`Did you mean *${person.name}*${knownString}? (yes/no)`, (response) => {
            console.log('got response', response);
            if(response.text.toLowerCase() === 'yes') {
                return resolve(person);
            } else {
                resolve(false);
                conversation.next(); // will break otherwise, but not if person was found!
            }
        });

    });
}


function* replyWithMovies(conversation, movies) {
    if(!movies || !movies.length) {
        conversation.say('no results found :(')
        conversation.next();
        return;
    }
    console.log('found the movies!', conversation.status);

    let movie;
    const send = () => {
        movie = movies.shift()
        conversation.say(formatMovie(movie));
        conversation.next();
    }
    let stop = false;
    do {
        send();
        if(movies.length == 0) {
            stop = true;
        } else {
            stop = yield endCycle(conversation);
        }
    } while(!stop);

    if(movies.length > 0) {
        conversation.say(`It was a pleasure to serve you! I hope you enjoy ${movie.title}`);
    } else {
        conversation.say('That\'s all I have for now. Try another request for more.');
    }
    conversation.next();
}

function endCycle(conversation) {
    return new Promise((resolve) => {
        conversation.ask(`Do you want another movie? (yes/no)`, (response) => {
            conversation.next();
            if(response.text.toLowerCase() === 'yes') {
                return resolve(false);
            } else {
                resolve(true);
            }
        });

    });
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
    query['api_key'] = MOVIEDB_KEY;
    return `${movieDBURL}${urlPart}?${querystring.stringify(query)}`;
}

function formatMovie(movie) {
    const year = movie.release_date.split('-')[0];
    const poster = movie.poster_path? `Poster: https://image.tmdb.org/t/p/w185/${movie.poster_path}?${Date.now()}`: '';
    return `*${movie.title}* (_${year}_): \n ${movie.overview} \n${poster}`;
}

function formatWitResponse(body) {
  return {
        actors: getPropertiesFromWitResponse('actor' ,body),
        directors: getPropertiesFromWitResponse('director' ,body),
        genres: getPropertiesFromWitResponse('genre' ,body),
        year: _.get(body, 'outcomes[0].entities.year[0].value'),
        movie: _.get(body, 'outcomes[0].entities.movie[0].value'),
    };
}

function getPropertiesFromWitResponse(property, body) {
  var sizeOfArguments;
  const entity = _.get(body, `outcomes[0].entities[${property}]`);
  const entityValues = [];
  if(entity) {
      for(let i=0; i < entity.length;i++) {
        entityValues.push(entity[i].value);
      }
  }
  return entityValues;
}

function processLanguage(sentence) {
    console.log('XXXX', WIT_KEY);
    const query = {
        v: 20160227,
        q: sentence,
        access_token: WIT_KEY
    };
    return request.get({
        url: `${witURL}?${querystring.stringify(query)}`,
        json: true,
        method: 'GET'
    });
}