const express = require("express"),
    chalk = require("chalk"),
    TwitchChat = require("./TwitchChat"),
    Console = require("./Console"),
    Con = new Console("OTS Chat Box", "#9147FF");

let clientCount = 0;

class WebUI {
    constructor(options = {}) {
        if (!options.twitch) {
            Con.Err("No Twitch parameters provided, unable to start Twitch Chat Box");
        }

        // User defined parameters
        this.path = options.path || "/chat-box";
        this.port = options.port || 3031;

        // If existing app provided, serve from that, otherwise create new
        if (options.app && options.http && options.io) {
            this.app = options.app;
            this.http = options.http;
            this.io = options.io;
            Con.Log(
                `Attached to existing Express server, navigate to ${this.path}/<twitch username> on the address it is using`
            );
        } else {
            this.app = express();
            this.http = require("http").createServer(this.app);
            this.io = require("socket.io")(this.http);
            this.http.listen(this.port, () => {
                Con.Log(
                    `Existing server not provided, started local Express server at http://localhost:${this.port}${this.path}/<twitch username>`
                );
            });
        }

        // Serve pages
        this.app.use(`${this.path}/:channel`, express.static(`${__dirname}/html/`));

        // Create socket io connection and start listening on namespace
        this.sockets = this.io.of("/chat-box");
        this.chat = new TwitchChat(options.twitch, this.io);

        this.sockets.on("connection", (socket) => {
            this.rooms = undefined;

            socket.on("handshake", (data) => {
                this.rooms = data.channel.split("&");
                this.roomString = this.rooms.join(", ");
                // Join Room(s)
                for (let c of this.rooms) {
                    socket.join(`#${c}`);
                }
                Con.Log(`Client Connected to room(s) ${this.roomString}, current clients: ${++clientCount}`);
            });

            socket.on("disconnect", (data) => {
                Con.Log(`Client Disconnected from room(s) ${this.roomString}, current clients: ${--clientCount}`);
            });
        });
    }
}
module.exports = WebUI;
