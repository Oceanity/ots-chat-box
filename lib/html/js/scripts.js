"use strict"

$(function () {
    // Get vars from URL
    let channel = window.location.pathname.split("/")[2];

    // Root
    const body = $("body");

    // If channel provided, init scripts
    if (channel) {
        // Consts
        const chatBox = $("<ul>").attr("id", "chatbox").addClass("chatbox"),
            cloneBox = $("<ul>").attr("id", "cloned").addClass("chatbox"),
            clone = $("<li>").attr("id", "clone"),
            socket = io("/chat-box");
        // States
        let bg = false,
            lastUser = null,
            lastMessage = null,
            // Badge Object
            globalBadges = null,
            // Display settings
            mergeMessages = true,
            inlineMessages = false,
            showBadges = true;
        // Setup DOM
        body.append(chatBox).append(cloneBox);
        cloneBox.append(clone);

        // Announce chat socket
        socket.on("connect", () => {
            console.log("%c[Connected to server]", "color: #9147FF; font-weight:bold");
            socket.emit("handshake", {
                channel
            });
        });

        // Set config variables
        socket.on("config", data => {
            mergeMessages = data.mergeMessages;
            inlineMessages = data.inlineMessages;
            showBadges = data.showBadges;
        });

        // Get Global Badges
        $.ajax({
            url: "https://badges.twitch.tv/v1/badges/global/display",
            type: "GET",
            success: (res) => {
                globalBadges = res.badge_sets;
            },
            error: (error) => {
                throw error;
            },
        });

        // Chat cleared
        socket.on("clear", (data) => {
            console.log("%c[Chat Cleared]", "color: #9147FF; font-weight:bold");
            bg = false;
            chatBox.empty();
            lastMessage = null;
            lastUser = null;
        });

        // On Message
        socket.on("message", (data) => {
            const {
                context,
                message,
                self,
                isSuperUser
            } = data, {
                emotes,
                username
            } = context;
            const color = context.color || "#9147FF";
            const isHighlighted = IsHighlightedMessage(context);
            console.log(`%c${context["display-name"]}%c: ${message}`, "color: " + (color || "#ab187f") + "; font-weight:bold;", "color:#aaa");

            // Format message
            const content = $("<span>", {
                class: "content",
                text: username
            });

            // Find URLs and parse
            let regex = /(^|\s)(http:\/\/www\.|https:\/\/www\.|http:\/\/|https:\/\/)?[a-z0-9]+([\-\.]{1}[a-z0-9]+)*\.[a-z]{2,5}(:[0-9]{1,5})?(\/.*)?$/g,
                matches = message.match(regex);

            // Parse URLs, then append body to block
            ParseURLs(message, matches, isSuperUser, (message) => {
                ParseEmotes(message, emotes, (message) => {
                    let split = false;
                    content.html(message);

                    // Try adding to exiting message block if mergeMessages enabled and possible
                    if (mergeMessages && username == lastUser && lastMessage && !isHighlighted) {
                        // If merging inline messages, add new body content to old body content
                        clone.html(lastMessage.html());
                        if (inlineMessages) {
                            clone.find(".content").append(message);
                        } else {
                            clone.append(content);
                        }
                        if (clone.height() <= $(window).height() * 0.75) {
                            lastMessage.html(clone.html());
                            return;
                        }
                    }

                    // Else create new block
                    bg = !bg;
                    const block = $("<li>", {
                        class: [
                            "message",
                            inlineMessages ? "inline" : null,
                            bg ? "bg" : null
                        ].join(" "),
                        css: {
                            // Set color for name/highlights
                            "--theme-color": color
                        },
                        "data-from": context["username"]
                    });
                    const name = $("<span>", {
                        class: "name"
                    });

                    // If is highlighted
                    if (isHighlighted) {
                        split = true;
                        block.addClass("highlighted");;
                    }

                    // If showBadges enabled, display badges
                    if (showBadges && context.badges) {
                        let badges = $("<span>", {
                            class: "badges"
                        });
                        for (let b in context.badges) {
                            if (globalBadges && globalBadges.hasOwnProperty(b)) {
                                let versions = globalBadges[b]["versions"],
                                    urls = [];
                                for (let ver in versions) {
                                    urls.push(versions[ver]["image_url_2x"]);
                                }
                                const badge = $("<img />", {
                                    src: urls.pop()
                                });
                                badges.append(badge);
                            }
                        }
                        name.append(badges);
                    }
                    name.append(context["display-name"]);

                    // Append
                    block.append(name).append(content);
                    chatBox.append(block);
                    lastUser = context["username"];

                    // If split, remove lastmessage
                    if (split) lastMessage = null;
                    else lastMessage = block;
                });
            });
        });
        // End Message

        // On Timeout
        socket.on("timeout", (res) => {
            console.log(`[User ${res.user} Timed Out for ${res.length}]`);
            $(chatBox).find(`li[data-from="${res.user}"]`).remove();
            if (lastUser === res.user) {
                (lastUser = null), (lastMessage = null);
            }
        });

        // On Ban
        socket.on("ban", (res) => {
            console.log(`[User ${res.user} Banned]`);
            $(chatBox).find(`li[data-from="${res.user}"]`).remove();
            if (lastUser === res.user) {
                (lastUser = null), (lastMessage = null);
            }
        });

        function IsHighlightedMessage(context) {
            return context.hasOwnProperty("msg-id") && context["msg-id"] === "highlighted-message";
        }

        function GetURLHeaders(url, cb) {
            $.ajax({
                type: "HEAD",
                url: url,
                success: (response, status, xhr) => {
                    if (cb)
                        cb({
                            contentType: xhr.getResponseHeader("content-type"),
                        });
                },
            });
        }

        function ParseEmotes(message, emotes, callback) {
            let replacements = [];

            // Set up image tag replacements
            for (let i in emotes) {
                let tag = `<img src="https://static-cdn.jtvnw.net/emoticons/v1/${i}/1.0" />`,
                    coords = emotes[i][0].split("-"),
                    start = parseInt(coords[0]),
                    end = parseInt(coords[1]) + 1,
                    text = message.substring(start, end);
                replacements.push({
                    find: text,
                    replace: tag,
                });
            }

            // Replace instances of emote codes with emotes using map function
            message = message.split(" ");
            message = message.map(s => {
                for (let r of replacements) {
                    if (s === r.find)
                        return r.replace;
                }
                if (s.trim().length)
                    return s;
            }).join(" ");
            if (callback) callback(message);
        }

        function ParseURLs(message, matches, isSuperuser, callback) {
            if (matches && matches.length) {
                let match = matches.shift();
                GetURLHeaders(match.indexOf("http") == 0 ? match : `//${match}`, (res) => {
                    // Parse Images
                    if (res["contentType"].indexOf("image") === 0 && isSuperuser) {
                        message = message.replace(match, `<img src="${match}" />`);
                    } 
                    else message = message.replace(match, `<span class="link">${match}</span>`);
                    ParseURLs(message, matches, isSuperuser, callback);
                });
            } else if (callback && typeof callback === "function") callback(message);
        }
    }

    // If no channel specified, alert user
    else {
        body.append(
            `<div id="error"><h2>Please specify a channel in the URL, for example: <pre>https://[serveraddress]/[channel]/chat-box</pre></h2></div>`
        );
    }
});
