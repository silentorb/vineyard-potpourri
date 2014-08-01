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

class Songbird_SNS extends Vineyard.Bulb {
  platforms = {}

  grow() {
    var path = require('path')
    this.ground.load_schema_from_file(path.resolve(__dirname, 'schema.json'))

    var lawn = this.vineyard.bulbs.lawn
    this.listen(lawn, 'user.login', (user, args)=> this.on_login(user, args))

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
    platform.addUser(device_id, null, function (err, endpointArn) {
      if (err)
        def.reject(err)

      def.resolve()
        .then(()=> {
          var sql = "REPLACE INTO push_targets () VALUES ()"
          return this.ground.db.query(sql)
        })

    })

    return def.promise
  }

  send(user, message):Promise {
    return this.ground.db.query('SELECT * FROM push_targets WHERE user = ?', [user.id])
      .then((rows)=> {
        if (rows.length == 0)
          return when.resolve([])

        return when.all(rows.map((row)=> this.send_to_endpoint(row.platform, row.endpoint, message)))
      })
  }

  private send_to_endpoint(platform_name:string, endpoint:string, message:string) {
    var platform = this.get_platform(platform_name)
    var def = when.defer()
    platform.sendMessage(endpoint, message, function (err, message_id) {
      if (err)
        def.reject(err)

      def.resolve(message_id)
    })

    return def.promise
  }
}

export = Songbird_SNS