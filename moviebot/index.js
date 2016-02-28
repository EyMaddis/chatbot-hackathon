'use strict';
const Botkit = require('botkit');
const request = require('request-promise'); // for external API/HTTP requests
const querystring = require('querystring');
const co = require('co');
const _ = require('lodash');
const util = require('util');
const GenreMapper = require('./genreMapping');
const LanguageProcessing = require('./languageProcessing');

const movieDBURL = 'https://api.themoviedb.org/3/';

const SLACK_TOKEN = process.env.token;
const MOVIEDB_KEY = process.env.moviedb_key;
const WIT_KEY = process.env.wit_key;

if (!SLACK_TOKEN || !MOVIEDB_KEY || !WIT_KEY) {
  console.log('Error: Specify token, moviedb_key and wit_key in environment when starting the service');
  process.exit(1);
}
const languageProcessor = new LanguageProcessing(WIT_KEY);

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
    const parsedRequest = yield languageProcessor.process(query);

    const actors = parsedRequest.actors;
    const directors = parsedRequest.directors;
    const genres = parsedRequest.genres;

    const movieDBQuery = {
        sort_by: 'popularity.desc'
    };

    const people = _.flatten([actors, directors]);
    if(people.length > 0) {
        const peopleNameToID = {};
        for(const name of people) {
            const id = yield getPersonId(conversation, name);
            peopleNameToID[name] = id;
        }
        console.log('people ids', peopleNameToID);

        let invalidNames = people.filter(name => !peopleNameToID[name]);

        console.log('invalid Names!', invalidNames);

        if(invalidNames.length > 0) {
            conversation.say(`Oh no, could not find ${invalidNames.length > 1? 'people':'person'} _${invalidNames.join('_, _')}_`);
            conversation.next();
            return;
        }
        console.log('getting movies for the following people:', people);
        const ids = Object.keys(peopleNameToID).map(name => peopleNameToID[name]);
        movieDBQuery.with_people = ids.join(' AND ');
    }

    if(genres) {
        const genreIds = genres.map(GenreMapper.toID);
        const invalidGenres = [];
        genres.forEach((genre, index) => {
            if(!genreIds[index]) {
                invalidGenres.push(genre);
            }
        })

        if(invalidGenres.length > 0) {
            conversation.say(`Oh no, I do not know the ${invalidGenres.length > 1? 'genres':'genre'} _${invalidGenres.join('_, _')}_`);
            conversation.next();
            return;
        }
        movieDBQuery.with_genres = genreIds.join(' AND ');
    }

    const moviesResult = yield getFromMovieDB('discover/movie', movieDBQuery);
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
            }
        });
        conversation.next(); // will break otherwise, but not if person was found!

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

function* getPersonId(conversation, name) {
    const results = yield getFromMovieDB('search/person', {
            query: name,
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
    return person.id;
}