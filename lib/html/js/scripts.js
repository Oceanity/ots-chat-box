$(function () {
    // Get vars from URL
    let channel = window.location.pathname.split('/')[2];

    // Consts
    const {
        log
    } = console
    body = $(`body`);

    if (channel) {
        // Vars
        let chatBox = $('<ul>').attr('id', 'chatbox').addClass('chatbox'),
            cloneBox = $('<ul>').attr('id', 'cloned').addClass('chatbox'),
            clone = $('<li>').attr('id', 'clone'),
            socket = io('/chat-box'),
            index = 0,
            lastUser = null,
            lastMessage = null,
            globalBadges = null;
        // Setup DOM
        body.append(chatBox).append(cloneBox);
        cloneBox.append(clone);

        // Announce chat socket
        socket.on('connect', () => {
            log('[Connected to server]');
            socket.emit('handshake', {
                channel
            });
        });

        // Get Global Badges
        $.ajax({
            url: 'https://badges.twitch.tv/v1/badges/global/display',
            type: 'GET',
            success: (res) => {
                globalBadges = res.badge_sets;
            },
            error: (error) => {
                throw error;
            },
        });

        // Chat cleared
        socket.on('clear', (data) => {
            log('[Chat Cleared]');
            index = 0;
            chatBox.empty();
            lastMessage = null;
            lastUser = null;
        });

        // On Message
        socket.on('message', (data) => {
            const {
                context,
                message,
                isSuperUser
            } = data, {
                color,
                emotes,
                username
            } = context;
            log(`%c${context['display-name']}` + `%c ${message}`, 'color: ' + (color || '#ab187f') + '; font-weight:bold;', 'color:#000');

            // Format message
            let body = $('<span>').addClass('content').text(username);

            // Find URLs and parse
            let regex = /(^|\s)(http:\/\/www\.|https:\/\/www\.|http:\/\/|https:\/\/)?[a-z0-9]+([\-\.]{1}[a-z0-9]+)*\.[a-z]{2,5}(:[0-9]{1,5})?(\/.*)?$/g,
                matches = message.match(regex);

            // Parse URLs, then append body to block
            ParseURLs(message, matches, isSuperUser, (message) => {
                ParseEmotes(message, emotes, (message) => {
                    body.html(message);

                    // Try adding to exiting message block if possible
                    if (username == lastUser && lastMessage) {
                        clone.html(lastMessage.html());
                        clone.append(body);
                        if (clone.height() <= $(window).height() * 0.75) {
                            lastMessage.append(body);
                            return;
                        }
                    }

                    // Else create new block
                    let block = $('<li>'),
                        name = $('<span>');

                    // Block
                    block.addClass('message');
                    if (index++ % 2 == 0) block.addClass('bg');
                    block.attr('data-from', context['username']);

                    // Nametag
                    name.addClass('name').css('color', context['color']);
                    if (context.badges) {
                        let badges = $('<span>').addClass('badges');
                        for (let i in context.badges) {
                            if (globalBadges && globalBadges.hasOwnProperty(i)) {
                                let versions = globalBadges[i]['versions'],
                                    urls = [];
                                for (let ver in versions) {
                                    urls.push(versions[ver]['image_url_2x']);
                                }
                                let badge = $('<img />');
                                badge.attr('src', urls.pop());
                                badges.append(badge);
                            }
                        }
                        name.append(badges);
                    }
                    name.append(context['display-name']);

                    // Append
                    block.append(name).append(body);
                    chatBox.append(block);
                    lastUser = context['username'];
                    lastMessage = block;
                });
            });
        });
        // End Message

        // On Timeout
        socket.on('timeout', (res) => {
            log(`[User ${res.user} Timed Out for ${res.length}]`);
            $(chatBox).find(`li[data-from="${res.user}"]`).remove();
            if (lastUser === res.user) {
                (lastUser = null), (lastMessage = null);
            }
        });

        // On Ban
        socket.on('ban', (res) => {
            log(`[User ${res.user} Banned]`);
            $(chatBox).find(`li[data-from="${res.user}"]`).remove();
            if (lastUser === res.user) {
                (lastUser = null), (lastMessage = null);
            }
        });

        function GetURLHeaders(url, cb) {
            $.ajax({
                type: 'HEAD',
                url: url,
                success: (response, status, xhr) => {
                    if (cb)
                        cb({
                            contentType: xhr.getResponseHeader('content-type'),
                        });
                },
            });
        }

        function ParseEmotes(message, emotes, callback) {
            if (emotes) {
                let replacements = [];
                for (let i in emotes) {
                    let tag = `<img src="https://static-cdn.jtvnw.net/emoticons/v1/${i}/1.0" />`,
                        coords = emotes[i][0].split('-'),
                        start = parseInt(coords[0]),
                        end = parseInt(coords[1]),
                        text = message.substring(start, end + 1);
                    replacements.push({
                        find: text,
                        replace: tag,
                    });
                }
                replacements.sort((a, b) => {
                    return b.find.length - a.find.length;
                });
                for (let i in replacements) message = message.replace(new RegExp(`(|:\\W)${replacements[i].find}(|:\\W)`, 'g'), replacements[i].replace);
            }
            if (callback) callback(message);
        }

        function ParseURLs(message, matches, isSuperuser, callback) {
            if (matches && matches.length) {
                let match = matches.shift();
                GetURLHeaders(match.indexOf('http') == 0 ? match : `//${match}`, (res) => {
                    // Parse Images
                    if (res['contentType'].indexOf('image') == 0 && isSuperuser) message = message.replace(match, `<img src="${match}" />`);
                    else message = message.replace(match, `<span class="link">${match}</span>`);
                    ParseURLs(message, matches, isSuperuser, callback);
                });
            } else if (callback && typeof callback === 'function') callback(message);
        }
    }

    // If no channel specified, alert user
    else {
        body.append(
            `<div id="error"><h2>Please specify a channel in the URL, for example: <pre>https://[serveraddress]/[channel]/chat-box</pre></h2></div>`
        );
    }
});