/// <reference path="../../../vineyard-lawn/lawn.d.ts"/>

import Vineyard = require('vineyard')

class Exile extends Vineyard.Bulb {

  grow() {
    var path = require('path')
    this.ground.load_schema_from_file(path.resolve(__dirname, 'schema.json'))

    this.listen(this.ground, 'ban.created', (ban)=> this.on_banned(ban))
  }

  on_banned(ban) {
    var lawn = this.vineyard.bulbs.lawn
    lawn.notify([ban.user], 'banned', ban)
      .then(()=> {
        console.log('ban', ban)
        var sockets = lawn.get_user_sockets(ban.user)
        for (var i in sockets) {
          var socket = sockets[i]
          socket.disconnect()
          console.log('Forced disconnect of socket ' + socket.id + '.')
        }
      })
  }
}

export = Exile