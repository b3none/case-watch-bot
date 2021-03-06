require('dotenv').config();
const cheerio = require('cheerio');
const axios = require('axios');
const fs = require('fs');
const express = require('express');
const app = express();
const Discord = require('discord.js');
const client = new Discord.Client();

const port = 3000;

if (fs.existsSync(`~${__dirname}/state.json`)) {
  console.log('Please copy the example.state.json to state.json');
  process.exit(1);
}

if (fs.existsSync(`~${__dirname}/.env`)) {
  console.log('Please copy the .env.example to .env');
  process.exit(1);
}

const mn_url = process.env.SITUATION_URL;

let discord_post = process.env.DISCORD_POST === 'true';

if (typeof process.env.SITUATION_URL == 'undefined') {
  console.log('Please set env var SITUATION_URL');
  process.exit(1);
}

let state = {};

let managers = {
  ri: {
    config: {
      url: 'https://docs.google.com/spreadsheets/u/0/d/1n-zMS9Al94CPj_Tc3K7Adin-tN9x1RSjjx2UzJ4SV7Q/gviz/tq?headers=0&range=A2:B5&gid=0&tqx=reqId:1',
    },
    updater: config => {
      axios.get(config.url)
        .then(response => {
          let payload = response.data.toString().slice(47, -2);
          let summary = JSON.parse(payload);

          let temp_result = {
            positive_cases: parseInt(summary.table.rows[0].c[1].v),
            negative_tests: parseInt(summary.table.rows[1].c[1].v),
            pending_tests: parseInt(summary.table.rows[2].c[1].v),
            quarantine: parseInt(summary.table.rows[3].c[1].v),
          };
          let updated_data = checkDataUpdate(temp_result, 'ri', state);
          temp_result['updated_data'] = updated_data;

          if (discord_post && updated_data) {
            axios.post(process.env.DISCORD_WEBHOOK_URL, {
              content: `New Rhode Island Coronavirus Data: \nPositive: ${temp_result.positive_cases}\nNegative tests: ${temp_result.negative_tests}\nPending Tests: ${temp_result.pending_tests}\nUnder Quarantine: ${temp_result.quarantine}`,
            });
          }

          storeState('ri', temp_result);
        })
        .catch(error => console.log(`Failed to get ri cases: ${error}`));
    },
  },
  fed: {
    config: {
      url: 'https://www.cdc.gov/coronavirus/2019-ncov/cases-in-us.html',
    },
    updater: config => {
      axios.get(config.url)
        .then(response => {
          const $ = cheerio.load(response.data.toString());
          let summary = $('.2019coronavirus-summary');

          let temp_result = {
            positive_cases: parseInt(summary.find('li').eq(0).text().split(' ')[2]),
            deaths: parseInt(summary.find('li').eq(1).text().split(' ')[2]),
          };
          let updated_data = checkDataUpdate(temp_result, 'fed', state);
          temp_result['updated_data'] = updated_data;

          if (discord_post && updated_data) {
            axios.post(process.env.DISCORD_WEBHOOK_URL, {
              content: `New Federal Coronavirus Data: \nPositive Cases: ${temp_result.positive_cases}\nDeaths: ${temp_result.deaths}`
            });
          }

          storeState('fed', temp_result);
        })
        .catch(error => console.log(`Failed to get fed cases: ${error}`));
    },
  },
  mn: {
    config: {
      url: mn_url,
    },
    updater: config => {
      axios.get(config.url)
        .then(response => {
          const $ = cheerio.load(response.data.toString());
          let body = $('#body');

          let temp_result = {
            positive_cases: parseInt(body.find('li').eq(1).text().split(' ')[0]),
            total_cases: parseInt(body.find('li').eq(0).text().split(' ')[0]),
          };
          let updated_data = checkDataUpdate(temp_result, 'mn', state);
          temp_result['updated_data'] = updated_data;

          if (discord_post && updated_data) {
            axios.post(process.env.DISCORD_WEBHOOK_URL, {
              content: `New Minnesota Coronavirus Data: \nPositive: ${temp_result.positive_cases}\nTotal Tested: ${temp_result.total_cases}`
            });
          }

          storeState('mn', temp_result);
        })
        .catch(error => console.log(`Failed to get mn cases: ${error}`));
    }
  },
  ny: {
    config: {
      url: 'https://www.health.ny.gov/diseases/communicable/coronavirus/',
    },
    updater: config => {
      axios.get(config.url)
        .then(response => {
          const $ = cheerio.load(response.data.toString());

          let $td = $('td');
          let temp_result = {
            upstate_cases: parseInt($td.eq(-5).text()),
            nyc_cases: parseInt($td.eq(-3).text()),
            total_cases: parseInt($td.eq(-1).text()),
          };
          let updated_data = checkDataUpdate(temp_result, 'ny', state);
          temp_result['updated_data'] = updated_data;

          if (discord_post && updated_data) {
            axios.post(process.env.DISCORD_WEBHOOK_URL, {
              content: `New York Coronavirus Data: \nNYC Positive Cases: ${temp_result.nyc_cases}\nNon-NYC Positive Cases: ${temp_result.upstate_cases}\nTotal Positive Cases: ${temp_result.total_cases}`
            });
          }

          storeState('ny', temp_result);
        })
        .catch(error => console.log(`Failed to get ny cases: ${error}`));
    }
  },
  or: {
    config: {
      url: 'https://www.oregon.gov/oha/PH/DISEASESCONDITIONS/DISEASESAZ/Pages/emerging-respiratory-infections.aspx',
    },
    updater: config => {
      axios.get(config.url)
        .then(response => {
          const $ = cheerio.load(response.data.toString());
          let summary = $('.ExternalClass23E56795FBF0468C9F856CD297450134');
          let $td = summary.find('td');

          let temp_result = {
            positive_cases: parseInt($td.eq(2).text()),
            negative_tests: parseInt($td.eq(4).text()),
            pending_tests: parseInt($td.eq(6).text()),
          };

          let updated_data = checkDataUpdate(temp_result, 'or', state);
          temp_result['updated_data'] = updated_data;

          if (discord_post && updated_data) {
            axios.post(process.env.DISCORD_WEBHOOK_URL, {
              content: `New Oregon Coronavirus Data: \nPositive: ${temp_result.positive_cases}\nNegative tests: ${temp_result.negative_tests}\nPending Tests: ${temp_result.pending_tests}\n`
            });
          }

          storeState('or', temp_result);
        })
        .catch(error => console.log(`Failed to get or cases: ${error}`));
    },
  },
};

const checkDataUpdate = (cases, loc, state) => {
  var is_updated = false;

  for (var key in cases) {
    let val = cases[key];
    if (val != state[loc][key]) {
      is_updated = true;
    }
  }

  return is_updated;
};

const loadState = () => {
  //thanks w3schools
  fs.readFile('state.json', (err, data) => {
    state = JSON.parse(data);
    console.log('Loaded state from filesystem!');
  });
};

const storeState = (state_name, val) => {
  state[state_name] = val;
  console.log(`Set state ${state_name} to ${JSON.stringify(val)}`);
  //thanks stackabuse.com
  fs.writeFile('state.json', JSON.stringify(state), (err) => {
    if (err) throw err;
    console.log('Saved state to filesystem!');
  });
};

loadState();

for (let [, manager] of Object.entries(managers)) {
  if (typeof manager.updater != 'undefined') {
    setInterval(() => {
      manager.updater(manager.config);
    }, 60000);
  }
}

app.get('/', (req, res) => res.send('Hello World!'));
app.get('/cases/all', (req, res) => res.send(result));
app.get('/cases/mn', (req, res) => res.send(result.mn));
app.get('/cases/ny', (req, res) => res.send(result.ny));
app.get('/cases/or', (req, res) => res.send(result.or));
app.get('/cases/ri', (req, res) => res.send(result.ri));
app.get('/cases/fed', (req, res) => res.send(result.fed));

//discord bot
client.on('ready', () => console.log(`Logged in as ${client.user.tag}!`));

client.on('message', msg => {
  if (msg.content === '!mn') {
    msg.reply(`Minnesota Coronavirus Data: \nPositive: ${state.mn.positive_cases}\nTotal Tested: ${state.mn.total_cases}`);
    return;
  }

  if (msg.content === '!fed') {
    msg.reply(`Federal Coronavirus Data: \nPositive: ${state.fed.positive_cases}\nDeaths: ${state.fed.deaths}`);
    return;
  }

  if (msg.content === '!ny') {
    msg.reply(`New York Coronavirus Data: \nNYC Positive: ${state.ny.nyc_cases}\nNon-NYC Positive: ${state.ny.upstate_cases}\nTotal Positive: ${state.ny.total_cases}`)
    return;
  }

  if (msg.content === '!ri') {
    msg.reply(`Rhode Island Coronavirus Data: \nPositive: ${state.ri.positive_cases}\nNegative tests: ${state.ri.negative_tests}\nPending Tests: ${state.ri.pending_tests}\nUnder Quarantine: ${state.ri.quarantine}`)
    return;
  }

  if (msg.content === '!or') {
    msg.reply(`Oregon Coronavirus Data: \nPositive: ${state.or.positive_cases}\nNegative tests: ${state.or.negative_tests}\nPending Tests: ${state.or.pending_tests}\n`)
  }
});

app.listen(port, () => console.log(`Example app listening on port ${port}!`));

if (discord_post) {
  client.login(process.env.DISCORD_TOKEN);
}
