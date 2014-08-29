/// <reference path="../../../vineyard-lawn/lawn.d.ts"/>

import Vineyard = require('vineyard')
var SNS = require('sns-mobile');
import when = require('when')

interface Push_Platform {
  addUser
  sendMessage
}

interface Config {
  path:string
  sns_key_id:string
  sns_access_key:string
  android_arn:string
  ios_arn:string
  region:string
  api_version:string
}

var EMITTED_EVENTS = {
  BROADCAST_START: 'broadcastStart',
  BROADCAST_END: 'broadcastEnd',
  SENT_MESSAGE: 'messageSent',
  DELETED_USER: 'userDeleted',
  FAILED_SEND: 'sendFailed',
  ADDED_USER: 'userAdded',
  ADD_USER_FAILED: 'addUserFailed'
};

class Songbird_SNS extends Vineyard.Bulb {
  platforms = {}

  grow() {
    var path = require('path')
    this.ground.load_schema_from_file(path.resolve(__dirname, 'schema.json'))

    var lawn = this.vineyard.bulbs.lawn
    this.listen(lawn, 'user.login', (user, args)=> this.on_login(user, args))

    var songbird = this.vineyard.bulbs.songbird
    if (!songbird)
      throw new Error("Songbird_SNS requires the Songbird bulb.")

    songbird.add_fallback(this)

    var config:Config = this.config

    if (config.android_arn)
      this.create_platform('android', config.android_arn)

    if (config.ios_arn)
      this.create_platform('ios', config.ios_arn)
  }

  create_platform(name:string, arn:string) {
    console.log('creating push platform for ' + name + '.')
    var config:Config = this.config
    this.platforms[name] = new SNS({
      platform: name,
      region: config.region,
      apiVersion: config.api_version,
      accessKeyId: config.sns_key_id,
      secretAccessKey: config.sns_access_key,
      platformApplicationArn: arn
    })
  }

  private get_platform(name:string):Push_Platform {
    var result = this.platforms[name]
    if (!result)
      throw new Error("There is no platform configuration named: " + name + ".")

    return result
  }

  private on_login(user, args):Promise {
    if (args && args.platform && args.device_id)
      return this.register(user, args.platform, args.device_id)

    if (!args)
      console.log("WARNING: Songbird_SNS was not able to get the login arguments.  Possibly using an old version of Lawn.")

    return when.resolve()
  }

  register(user, platform_name:string, device_id:string):Promise {
    var def = when.defer()
    var platform = this.get_platform(platform_name)
    var data = JSON.stringify({
      userId: user.id
    })
    platform.addUser(device_id, data, (err, endpoint)=> {
      if (err) {
        def.reject(err)
        return when.resolve()
      }

      var sql = "REPLACE INTO `wevent_db`.`push_targets` (`user`, `device_id`, `endpoint`, `platform`, `timestamp`)"
      + "\n VALUES (?, ?, ?, ?, UNIX_TIMESTAMP(NOW()))"
      return this.ground.db.query(sql, [user.id, device_id, endpoint, platform_name])
        .then(()=> {
          def.resolve()
        })
    })

    return def.promise
  }

  send(user, message):Promise {
    console.log('pushing message to user ' + user.id + '.', message)
    return this.ground.db.query('SELECT * FROM push_targets WHERE user = ?', [user.id])
      .then((rows)=> {
        if (rows.length == 0)
          return when.resolve([])

        return when.all(rows.map((row)=> this.send_to_endpoint(row.platform, row.endpoint, message)))
      })
  }

  private send_to_endpoint(platform_name:string, endpoint:string, message) {
    console.log('send_to_endpoint', platform_name)
    var platform = this.get_platform(platform_name)
    var def = when.defer()
    var data = {
      aps: {
        alert: "You have a " + message.type,
        badge: 5,
        payload: message
      }
    }

    var json = {}
//    console.log("sns aps:", data)
    json[this.config.ios_payload_key] = JSON.stringify(data)

    console.log("sending sns:", json)
    this.publish(platform, endpoint, json, (err, message_id)=> {
      if (err) {
        console.log("sns error: ", err)
        def.reject(err)
        return
      }
      console.log('message pushed to endpoint ' + endpoint)
      def.resolve(message_id)
    })

    return def.promise
  }

  private publish(platform, endpointArn, message, callback) {
    platform.sns.publish({
      Message: JSON.stringify(message),
      TargetArn: endpointArn,
      MessageStructure: 'json',
    }, function(err, res) {
      if (err) {
        platform.emit(EMITTED_EVENTS.FAILED_SEND, endpointArn, err);
      } else {
        platform.emit(EMITTED_EVENTS.SENT_MESSAGE, endpointArn, res.MessageId);
      }

      return callback(err, ((res && res.MessageId) ? res.MessageId : null));
    });
  }

}

export = Songbird_SNS