var __extends = this.__extends || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    __.prototype = b.prototype;
    d.prototype = new __();
};
var Vineyard = require('vineyard');
var SNS = require('sns-mobile');
var when = require('when');

var Songbird_SNS = (function (_super) {
    __extends(Songbird_SNS, _super);
    function Songbird_SNS() {
        _super.apply(this, arguments);
        this.platforms = {};
    }
    Songbird_SNS.prototype.grow = function () {
        var _this = this;
        var path = require('path');
        this.ground.load_schema_from_file(path.resolve(__dirname, 'schema.json'));

        var lawn = this.vineyard.bulbs.lawn;
        this.listen(lawn, 'user.login', function (user, args) {
            return _this.on_login(user, args);
        });

        var config = this.config;

        if (config.android_arn)
            this.create_platform('android', config.android_arn);

        if (config.ios_arn)
            this.create_platform('ios', config.ios_arn);
    };

    Songbird_SNS.prototype.create_platform = function (name, arn) {
        console.log('creating push platform for ' + name + '.');
        var config = this.config;
        this.platforms[name] = new SNS({
            platform: name,
            region: config.region,
            apiVersion: config.api_version,
            accessKeyId: config.sns_key_id,
            secretAccessKey: config.sns_access_key,
            platformApplicationArn: arn
        });
    };

    Songbird_SNS.prototype.get_platform = function (name) {
        var result = this.platforms[name];
        if (!result)
            throw new Error("There is no platform configuration named: " + name + ".");

        return result;
    };

    Songbird_SNS.prototype.on_login = function (user, args) {
        if (args && args.platform && args.device_id)
            return this.register(user, args.platform, args.device_id);

        if (!args)
            console.log("WARNING: Songbird_SNS was not able to get the login arguments.  Possibly using an old version of Lawn.");

        return when.resolve();
    };

    Songbird_SNS.prototype.register = function (user, platform_name, device_id) {
        var def = when.defer();
        var platform = this.get_platform(platform_name);
        platform.addUser(device_id, null, function (err, endpointArn) {
            var _this = this;
            if (err)
                def.reject(err);

            def.resolve().then(function () {
                var sql = "REPLACE INTO push_targets () VALUES ()";
                return _this.ground.db.query(sql);
            });
        });

        return def.promise;
    };

    Songbird_SNS.prototype.send = function (user, message) {
        var _this = this;
        return this.ground.db.query('SELECT * FROM push_targets WHERE user = ?', [user.id]).then(function (rows) {
            if (rows.length == 0)
                return when.resolve([]);

            return when.all(rows.map(function (row) {
                return _this.send_to_endpoint(row.platform, row.endpoint, message);
            }));
        });
    };

    Songbird_SNS.prototype.send_to_endpoint = function (platform_name, endpoint, message) {
        var platform = this.get_platform(platform_name);
        var def = when.defer();
        platform.sendMessage(endpoint, message, function (err, message_id) {
            if (err)
                def.reject(err);

            def.resolve(message_id);
        });

        return def.promise;
    };
    return Songbird_SNS;
})(Vineyard.Bulb);

module.exports = Songbird_SNS;
//# sourceMappingURL=songbird_sns.js.map
