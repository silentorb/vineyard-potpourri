var __extends = this.__extends || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    __.prototype = b.prototype;
    d.prototype = new __();
};
var Vineyard = require('vineyard');

var Exile = (function (_super) {
    __extends(Exile, _super);
    function Exile() {
        _super.apply(this, arguments);
    }
    Exile.prototype.grow = function () {
        var _this = this;
        var path = require('path');
        this.ground.load_schema_from_file(path.resolve(__dirname, 'schema.json'));

        this.listen(this.ground, 'ban.created', function (ban) {
            return _this.on_banned(ban);
        });
    };

    Exile.prototype.on_banned = function (ban) {
        var lawn = this.vineyard.bulbs.lawn;
        lawn.notify([ban.user], 'banned', ban).then(function () {
            console.log('ban', ban);
            var sockets = lawn.get_user_sockets(ban.user);
            for (var i in sockets) {
                var socket = sockets[i];
                socket.disconnect();
                console.log('Forced disconnect of socket ' + socket.id + '.');
            }
        });
    };
    return Exile;
})(Vineyard.Bulb);

module.exports = Exile;
//# sourceMappingURL=exile.js.map
