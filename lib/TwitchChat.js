const tmi = require("tmi.js");

class TwitchChat {
    constructor(options = {}, io) {
        // Set up default parameters
        this.Params = {};
        // Set up user-defined paramaters
        this.Params.channels = options.channels;
        this.Params.oauth = options.oauth;

        if (!this.Params.channels) {
            throw Error(
                "`channels` not defined, please input the channel you wish to read chat from."
            );
        }

        if (!this.Params.oauth) {
            throw Error(
                "`oauth` not defined, please enter the oauth key you received from Twitch.  To learn more, visit https://twitchapps.com/tmi/ while logged in to the associated Twitch account."
            );
        }

        this.Client = new tmi.client(this.Params);

        // If socket, attach chat events to socket emits
        if (io) {
            this.sockets = io.of('/chat-box');
            this.Client.on("clearchat", (target) => {
                this.sockets.to(target).emit("clear", {
                    target,
                });
            });

            this.Client.on("ban", (target, user, message, context) => {
                this.sockets.to(target).emit("ban", {
                    target,
                    user,
                    message,
                    context,
                });
            });

            this.Client.on(
                "timeout",
                (target, user, message, length, context) => {
                    this.sockets.to(target).emit("timeout", {
                        target,
                        user,
                        message,
                        length,
                        context,
                    });
                }
            );

            this.Client.on("message", (target, context, message, self) => {
                this.sockets.to(target).emit("message", {
                    target,
                    context,
                    message,
                    self,
                });
            });

        }
        this.Client.connect();
    }
}
module.exports = TwitchChat;