const tmi = require("tmi.js"),
    Color = require("color");

class TwitchChat {
    constructor(options = {}, io) {
        // Set up default parameters
        this.Params = {};
        // Set up user-defined paramaters
        this.Params.channels = options.channels;
        this.Params.oauth = options.oauth;
        this.Params.colors = options.colors || ["#5BCFFA", "#F5AAB9"];
        this.Params.userColors = {};

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
                // Assign random twitch-friendly color if none provided via Prime
                if (!context.color && !this.Params.userColors.hasOwnProperty(context.username)) {
                    const hue = Math.floor(Math.random() * 255);
                    this.Params.userColors[context.username] = `hsl(${hue},80%,65%)`;
                    //this.Params.userColors[context.username] = this.Params.colors[Math.floor(Math.random() * this.Params.colors.length)]
                }
                context.color = context.color || this.Params.userColors[context.username];
                context.highlightColor = Color(context.color).darken(0.5).alpha(0.5).toString();
                // Emit message to client
                this.sockets.to(target).emit("message", {
                    isSuperUser: HasBadge(context, "broadcaster") || context.mod,
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
function HasBadge(context, badgeName) {
    return context.badges && context.badges.hasOwnProperty(badgeName);
}

module.exports = TwitchChat;
