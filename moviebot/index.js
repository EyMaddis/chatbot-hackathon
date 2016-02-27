'use strict';
const Botkit = require('botkit');
const request = require('request-promise'); // for external API/HTTP requests
const querystring = require('querystring');

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

    const query = {
        'sort_by': 'popularity.desc',
        query: message.match[1],
        'api_key': process.env.moviedb_key
    }
    const requestOptions = {
        uri: `${movieDBURL}search/person?${querystring.stringify(query)}`
    }
    console.log('starting request', requestOptions, query);

    request(requestOptions)
        .then((results) => {
            const people = results.results
            console.log('found people', people);

        })
        .catch((err) => {
            console.error('oh no', err, err.stack);
        });

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