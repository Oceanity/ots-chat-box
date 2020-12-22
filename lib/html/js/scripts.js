"use strict"

$(function () {
    // Get vars from URL
    let channel = window.location.pathname.split("/")[2];

    // Root
    const body = $("body");

    // If channel provided, init scripts
    if (channel) {
        // Consts
        const chatBox = $("<ul>", { id: "chatbox", class: "chatbox" }),
            cloneBox = $("<ul>", { id: "cloned", class: "chatbox" }),
            clone = $("<li>", { id: "clone" }),
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
            const regex = /(?:^|\s)(?:https?\:\/\/)?(\w+\.)?[\w.?&=-]+\.\w+(?:\/[\w.?&=\/:.+\-%_]*)*(?:\s|$)/ig;
            let splitMessage = message.split(" "),
                matches = [];

            for (let index in splitMessage) {
                let match = splitMessage[index].match(regex);
                if (match) {
                    matches.push({ index, url: match.shift() });
                }
            }

            console.log(matches);

            // Parse URLs, then append body to block
            ParseURLs(splitMessage, matches, isSuperUser, (message) => {
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

        function TestImage(url, callback, timeout = 5000) {
            let timedOut = false,
                timer;
            const img = new Image();
            img.onerror = img.onabort = function () {
                if (!timedOut) {
                    clearTimeout(timer);
                    callback(false);
                }
            };
            img.onload = function () {
                if (!timedOut) {
                    clearTimeout(timer);
                    callback(true);
                }
            };
            img.src = url;
            timer = setTimeout(function () {
                timedOut = true;
                callback(null);
            }, timeout);
        }

        function ParseEmotes(message, emotes, callback) {
            let replacements = [];

            // Set up image tag replacements
            for (let i in emotes) {
                const wrapper = $("<span>", { class: "emote" }),
                    img = $("<img>", { src: `https://static-cdn.jtvnw.net/emoticons/v1/${i}/4.0` }),
                    coords = emotes[i][0].split("-"),
                    start = parseInt(coords[0]),
                    end = parseInt(coords[1]) + 1,
                    text = message.substring(start, end);
                wrapper.append(img);
                replacements.push({
                    find: text,
                    replace: wrapper[0].outerHTML,
                });
            }

            // Replace instances of emote codes with emotes using map function
            message = message.split(" ").map(s => {
                for (let r of replacements) {
                    if (s === r.find)
                        return r.replace;
                }
                if (s.trim().length)
                    return s;
            }).join(" ");
            if (callback) callback(message);
        }

        function ParseURLs(splitMessage, matches, isSuperuser, callback) {
            // Only allow one image embed per message
            let hasEmbeddedImage = false;
            // If matches, recursively process replacements
            if (matches.length) {
                function Pass(splitMessage, matches) {
                    if (matches.length) {
                        let match = matches.shift();
                        console.log(match);
                        TestImage(match.url, isImage => {
                            if (isImage && !hasEmbeddedImage && isSuperuser) {
                                const img = $("<img>", { src: match.url });
                                splitMessage[match.index] = img[0].outerHTML;
                                hasEmbeddedImage = true;
                                Pass(splitMessage, matches);
                            }
                            else {
                                const span = $("<span>", { class: "link", text: match.url });
                                splitMessage[match.index] = span[0].outerHTML;
                                Pass(splitMessage, matches);
                            }
                        });
                    }
                    else if (callback && typeof callback === "function") callback(splitMessage.join(" "));
                } Pass(splitMessage, matches);
            } else if (callback && typeof callback === "function") callback(splitMessage.join(" "));
        }
    }

    // If no channel specified, alert user
    else {
        body.append(
            `<div id="error"><h2>Please specify a channel in the URL, for example: <pre>https://[serveraddress]/[channel]/chat-box</pre></h2></div>`
        );
    }
});
