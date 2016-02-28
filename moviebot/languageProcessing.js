'use strict';
const querystring = require('querystring');
const request = require('request-promise');
const _ = require('lodash');
const witURL = 'https://api.wit.ai/message';


module.exports = class LanguageProcessing {
    constructor(key) {
        this.WIT_KEY = key;
    }

    *process(sentence) {
        const witResponse = yield this.doRequest(sentence);
        return this.formatResponse(witResponse);
    }
    *doRequest(sentence) {
        const query = {
            v: 20160227,
            q: sentence,
            access_token: this.WIT_KEY
        };
        return request.get({
            url: `${witURL}?${querystring.stringify(query)}`,
            json: true,
            method: 'GET'
        });
    }

    formatResponse(body) {
      return {
            actors: this.getPropertiesFromResponse('actor' ,body),
            directors: this.getPropertiesFromResponse('director' ,body),
            genres: this.getPropertiesFromResponse('genre' ,body),
            year: _.get(body, 'outcomes[0].entities.year[0].value'),
            movie: _.get(body, 'outcomes[0].entities.movie[0].value'),
        };
    }

    getPropertiesFromResponse(property, body) {
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

}