/*~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
           ______     ______     ______   __  __     __     ______
          /\  == \   /\  __ \   /\__  _\ /\ \/ /    /\ \   /\__  _\
          \ \  __<   \ \ \/\ \  \/_/\ \/ \ \  _"-.  \ \ \  \/_/\ \/
           \ \_____\  \ \_____\    \ \_\  \ \_\ \_\  \ \_\    \ \_\
            \/_____/   \/_____/     \/_/   \/_/\/_/   \/_/     \/_/


This is a sample Slack bot built with Botkit.

This bot demonstrates many of the core features of Botkit:

* Connect to Slack using the real time API
* Receive messages based on "spoken" patterns
* Reply to messages
* Use the conversation system to ask questions
* Use the built in storage system to store and retrieve information
  for a user.

# RUN THE BOT:

  Create a new app via the Slack Developer site:

    -> http://api.slack.com

  Get a Botkit Studio token from Botkit.ai:

    -> https://studio.botkit.ai/

  Run your bot from the command line:

    clientId=<MY SLACK TOKEN> clientSecret=<my client secret> PORT=<3000> studio_token=<MY BOTKIT STUDIO TOKEN> node bot.js

# USE THE BOT:

    Navigate to the built-in login page:

    https://<myhost.com>/login

    This will authenticate you with Slack.

    If successful, your bot will come online and greet you.


# EXTEND THE BOT:

  Botkit has many features for building cool and useful bots!

  Read all about it here:

    -> http://howdy.ai/botkit

~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~*/



var dropDownList = {
    "text": "What route would you like to take?",
    "response_type": "in_channel",
    "attachments": [
        {
            "text": "Choose a route",
            "fallback": "Sorry, an error occured.",
            "color": "#3AA3E3",
            "attachment_type": "default",
            "callback_id": "route_selection",
            "actions": [
                {
                    "name": "route_list",
                    "text": "Pick a route...",
                    "type": "select",
                    "options": []
                }
            ]
        }
    ]
}

var dialogBox = {
    "callback_id": "ryde-46e2b0",
    "title": "Request a Ride",
    "submit_label": "Request",
    "elements": [
        {
            "type": "text",
            "label": "Pickup Location",
            "name": "loc_origin"
        },
        {
            "type": "text",
            "label": "Dropoff Location",
            "name": "loc_destination"
        }
    ]
}

var clickButton = {
    "text": "Ride?",
    "attachments": [
        {
            "text": "Accept?",
            "fallback": "Something went wrong",
            "callback_id": "accept_ride_request",
            "color": "#3AA3E3",
            "attachment_type": "default",
            "actions": [
                {
                    "name": "Yes",
                    "text": "Yes",
                    "type": "button",
                    "value": "Yes"
                },
                {
                    "name": "No",
                    "text": "No",
                    "style": "danger",
                    "type": "button",
                    "value": "No"
                }
            ]
        }
    ]
}

var env = require('node-env-file');
env(__dirname + '/.env');


if (!process.env.clientId || !process.env.clientSecret || !process.env.PORT) {
  usage_tip();
  // process.exit(1);
}

var Botkit = require('botkit');
var debug = require('debug')('botkit:main');

var bot_options = {
    clientId: process.env.clientId,
    clientSecret: process.env.clientSecret,
    // debug: true,
    redirectUri: 'https://ride-share.glitch.me/oauth',
    scopes: ['bot'],
    studio_token: process.env.studio_token,
    studio_command_uri: process.env.studio_command_uri
};

// Use a mongo database if specified, otherwise store in a JSON file local to the app.
// Mongo is automatically configured when deploying to Heroku
if (process.env.MONGO_URI) {
    var mongoStorage = require('botkit-storage-mongo')({mongoUri: process.env.MONGO_URI});
    bot_options.storage = mongoStorage;
} else {
    bot_options.json_file_store = __dirname + '/.data/db/'; // store user data in a simple JSON format
}

// Create the Botkit controller, which controls all instances of the bot.
var controller = Botkit.slackbot(bot_options);

controller.startTicking();

// Set up an Express-powered webserver to expose oauth and webhook endpoints
var webserver = require(__dirname + '/components/express_webserver.js')(controller);

if (!process.env.clientId || !process.env.clientSecret) {

  // Load in some helpers that make running Botkit on Glitch.com better
  require(__dirname + '/components/plugin_glitch.js')(controller);

  webserver.get('/', function(req, res){
    res.render('installation', {
      studio_enabled: controller.config.studio_token ? true : false,
      domain: req.get('host'),
      protocol: req.protocol,
      glitch_domain:  process.env.PROJECT_DOMAIN,
      layout: 'layouts/default'
    });
  })

  var where_its_at = 'https://' + process.env.PROJECT_DOMAIN + '.glitch.me/';
  console.log('WARNING: This application is not fully configured to work with Slack. Please see instructions at ' + where_its_at);
}else {

  webserver.get('/', function(req, res){
    res.render('index', {
      domain: req.get('host'),
      protocol: req.protocol,
      glitch_domain:  process.env.PROJECT_DOMAIN,
      layout: 'layouts/default'
    });
  })
  // Set up a simple storage backend for keeping a record of customers
  // who sign up for the app via the oauth
  require(__dirname + '/components/user_registration.js')(controller);

  // Send an onboarding message when a new team joins
  require(__dirname + '/components/onboarding.js')(controller);

  // Load in some helpers that make running Botkit on Glitch.com better
  require(__dirname + '/components/plugin_glitch.js')(controller);

  // enable advanced botkit studio metrics
  require('botkit-studio-metrics')(controller);

  var normalizedPath = require("path").join(__dirname, "skills");
  require("fs").readdirSync(normalizedPath).forEach(function(file) {
    require("./skills/" + file)(controller);
  });  
  
  // This captures and evaluates any message sent to the bot as a DM
  // or sent to the bot in the form "@bot message" and passes it to
  // Botkit Studio to evaluate for trigger words and patterns.
  // If a trigger is matched, the conversation will automatically fire!
  // You can tie into the execution of the script using the functions
  // controller.studio.before, controller.studio.after and controller.studio.validate
  if (process.env.studio_token) {
    
      /***** Sends confirmation to the rider if they are accepted or not *****/
      controller.on('interactive_message_callback', function(bot, message) {
        if(message.callback_id == 'accept_ride_request'){
          if(message.actions[0].name == "Yes"){
            bot.reply(message, 'Rider Accepted'); 
            controller.storage.channels.all(function(err, user) {
              for(var i = 0; i < user.length; i++){
                if(user[i].id == message.user){
                  //bot.reply(message, 'works');
                  bot.reply({text: '', channel: message.actions[0].value}, 'You have been accepted to car pool on the ' + user[i].name + ' route.');
                  //startPrivateMessage(bot, user[i].id, message.actions[0].value);
                }
              }
            }); 
          }else{
            bot.reply(message, 'Rider Declined'); 
            controller.storage.channels.all(function(err, user) {
              for(var i = 0; i < user.length; i++){
                if(user[i].id == message.user){
                  user[i].seats = parseInt(user[i].seats) + 1;
                  bot.reply({text: '', channel: message.actions[0].value}, 'You have been declined to car pool on the ' + user[i].name + ' route');
                }
              }
            }); 
          }
        }
      });
    
    /*
    function startPrivateMessage(bot, driver, passenger) {
      bot.api.conversations.open({
        token: process.env.legacyToken,
        users: driver + "," + passenger,
        text: "You can use this message to work out the details of your upcoming ride."
      });
      }
    */
    
      /****** Sends acceptence message to route owner upon route selection *****/
      controller.on('interactive_message_callback', function(bot, message) {
        if(message.callback_id == 'route_selection'){
          //bot.reply(message, 'You chose a route!' + message.actions[0].selected_options[0].value); 
          controller.storage.channels.all(function(err, user) {
            for(var i = 0; i < user.length; i++){
              if(user[i].name == message.actions[0].selected_options[0].value){
                controller.storage.channels.get(user[i].id, function(err, user) {
                  bot.reply(message, '');
                }); 
                clickButton.text = "Accept Car Pool Ride Request From " + "<@" + message.user + ">";
                clickButton.attachments[0].actions[0].value = message.user;
                clickButton.attachments[0].actions[1].value = message.user;
                bot.reply({text: '', channel: user[i].id}, clickButton);
                user[i].seats = parseInt(user[i].seats) - 1;
                controller.storage.channels.save(user[i], function(err, user) {});
              }
            }
          }); 
        }
      });
    

      /***** Creates drop down menu of all available routes *****/
      controller.hears(['menu'], 'direct_message,direct_mention,mention', function(bot, message) {
        controller.storage.channels.all(function(err, user) {
          dropDownList.attachments[0].actions[0].options.length = 0;
          var text = '';
          for(var i = 0; i < user.length; i++){
            //bot.reply(message, '' + user[i].time);
            if(parseInt(user[i].seats) > 0){
              var string = user[i].name + '  ~  Seats: ' + user[i].seats;
              var object = { text: string, value: user[i].name };
              text += 'Route ' + user[i].name + ' by ' + user[i].driver + '\nWith ' + user[i].seats + ' seats on  ' + user[i].date + ' at ' + user[i].time + '\n\n';
              dropDownList.attachments[0].actions[0].options.push(object);
            }
          }
          dropDownList.attachments[0].text = text;
          bot.reply(message, dropDownList);
        });  
      });
    
    
      /***** Basic saving and loading of data *****/
      controller.hears(['save'], 'direct_message,direct_mention,mention', function(bot, message) {
        controller.storage.channels.save({id: message.user, name:message.text}, function(err, user) {});
      });
      controller.hears(['get'], 'direct_message,direct_mention,mention', function(bot, message) {
        //controller.storage.channels.all(function(err, user) {bot.reply(message, 'ok' + user.length);});  
        controller.storage.channels.get(message.user, function(err, user) {});  
      });
      controller.hears(['all'], 'direct_message,direct_mention,mention', function(bot, message) {
        controller.storage.channels.all(function(err, user) {
          var string = "";
          for(var i = 0; i < user.length; i++){
            string+= '[' + user[i].id + ',' + user[i].name + '] ';
          }
        });  
      });
      controller.hears(['delete'], 'direct_message,direct_mention,mention', function(bot, message) {
        controller.storage.channels.delete(message.user, function(err){});
      });
  } else {
      console.log('~~~~~~~~~~');
      console.log('NOTE: Botkit Studio functionality has not been enabled');
      console.log('To enable, pass in a studio_token parameter with a token from https://studio.botkit.ai/');
  }
}





function usage_tip() {
    console.log('~~~~~~~~~~');
    console.log('Botkit Starter Kit');
    console.log('Execute your bot application like this:');
    console.log('clientId=<MY SLACK CLIENT ID> clientSecret=<MY CLIENT SECRET> PORT=3000 studio_token=<MY BOTKIT STUDIO TOKEN> node bot.js');
    console.log('Get Slack app credentials here: https://api.slack.com/apps')
    console.log('Get a Botkit Studio token here: https://studio.botkit.ai/')
    console.log('~~~~~~~~~~');
}
