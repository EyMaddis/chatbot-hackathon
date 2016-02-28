'use strict';
const idMap = {
    action: 28,
    adventure: 12,
    animation: 16,
    comedy: 35,
    crime: 80,
    documentary: 99,
    drama:18,
    family: 10751,
    fantasy: 14,
    foreign: 10769,
    history: 36,
    horror: 27,
    music: 10402,
    mystery: 9648,
    romance: 10749,
    'science fiction': 878,
    'tv movie': 10770,
    thriller: 53,
    war: 10752,
    western: 37,
}

module.exports = {
    toID(genre) {
        let normalized = genre && genre.toLowerCase();
        if(normalized) normalized = normalized.trim();
        return idMap[normalized];
    }
}