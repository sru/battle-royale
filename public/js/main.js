(function(g) {

  g.WIDTH = 800;
  g.HEIGHT = 600;

  var game = g.game = new Phaser.Game(g.WIDTH, g.HEIGHT, Phaser.AUTO, 'screen');

  g.socket = io.connect();
  g.socket.io.reconnection(false);
  bindSocketEvents();

  g.sid = '';
  g.playerName = '';
  g.localPlayer = null;
  g.isLeader = false;
  g.mapId = 'lobby';
  g.mapData = {};
  g.map = null;
  g.remotePlayers = [];
  g.toAdd = [];
  g.toRemove = [];
  g.initialized = false;
  g.gameStarted = false;
  g.latency = 0;

  Object.defineProperties(g, {
    connected: {
      get: function() { return this.remotePlayers.length + 1; },
      enumerable: true
    }
  });


  function bindSocketEvents() {

    g.socket.on('connected', onSocketConnected);
    g.socket.on('getMap', onGetMap);
    g.socket.on('newPlayer', onNewPlayer);
    g.socket.on('updatePlayers', onUpdatePlayers);
    g.socket.on('removePlayer', onRemovePlayer);
    g.socket.on('startGameCountdown', onStartGameCountdown);
    g.socket.on('resetGame', onResetGame);
    g.socket.on('announceWinner', onAnnounceWinner);
  }


  function onSocketConnected(data) {
    g.sid = data.id;

    // Set player name
    g.playerName = prompt("Please enter your name.") || 'Player';
    g.socket.emit('setPlayerName', { name: g.playerName });
    g.socket.emit('getMap', { mapId: g.mapId });
  }


  function onGetMap(data) {
    if (data.map) {
      g.mapData[data.mapId] = data.map;
      if (!g.initialized) {
        game.state.add('default', { preload: preload, create: create, update: update, render: render });
        game.state.start('default');
      }
      else {
        game.cache.addTilemap('map:' + data.mapId, null, arrayToCSV(data.map), Phaser.Tilemap.CSV);
      }
    }
  }


  function onNewPlayer(data) {
    g.toAdd.push(data);
  }


  function onUpdatePlayers(data) {
    var playersData = data.players;

    // Leader of the map
    g.isLeader = playersData[0].id === g.sid;

    for (var i = 0; i < playersData.length; i++) {
      var playerData = playersData[i];
      var player;

      if (playerData.id === g.sid) {
        player = g.localPlayer;
      }
      else {
        player = playerById(playerData.id);
      }

      if (!player) {
        console.log("Player not found: " + playerData.id);
        continue;
      }

      player.name = playerData.name;
      player.x = cpc(playerData.x);
      player.y = cpc(playerData.y);
      player.rotation = playerData.rotation;
      player.getAt(1).visible = playerData.attacking;
      player.getAt(2).visible = playerData.blocking;
      player.health = playerData.health;
      player.alive = playerData.health > 0;

      var text = player.name + '\n';
      for (var j = 0; j < player.health / 20; j++) {
        text += '\u2588'; // Block element
      }
      player.getAt(3).text = text;
      player.getAt(3).rotation = -playerData.rotation;
      player.getAt(3).x = 54 * Math.cos(playerData.rotation + Math.PI / 2);
      player.getAt(3).y = -54 * Math.sin(playerData.rotation + Math.PI / 2);

      if (!player.alive) {
        player.getAt(0).animations.play('dead');
      }
      else if (playerData.attacking) {
        player.getAt(0).animations.play('attack');
      }
      else if (playerData.blocking) {
        player.getAt(0).animations.play('block');
      }
      else if (playerData.moving) {
        player.getAt(0).animations.play('walk');
      }
      else {
        player.getAt(0).animations.stop();
        player.getAt(0).animations.frame = 0;
      }
    }
  }


  function onRemovePlayer(data) {
    var player = playerById(data.id);

    if (!player) {
      console.log("Player not found: " + playerData.id);
      return;
    }

    g.remotePlayers.splice(g.remotePlayers.indexOf(player), 1);
    g.toRemove.push(player);
  }


  function onStartGameCountdown(text) {
    if (!g.initialized) {
      return;
    }

    var middleText = g.hud.getAt(g.hud.middleText);
    middleText.text = text;
    game.tweens.create(middleText).to({ alpha: 0 }, 1000, null, true).onComplete.addOnce(function() {
      this.text = '';
      this.alpha = 1;
    }, middleText);

    if (text === "Start!") {
      g.gameStarted = true;
    }
  }


  function onResetGame() {
    g.gameStarted = false;
    g.hud.getAt(g.hud.middleText).text = '';
  }


  function onAnnounceWinner(data) {
    if (data.id === g.sid) {
      g.hud.getAt(g.hud.middleText).text = "You are the winner!";
    }
    else {
      var player = playerById(data.id);
      if (!player) {
        console.log("Player not found: " + playerData.id);
        return;
      }

      g.hud.getAt(g.hud.middleText).text = "The winner is:\n" + player.name;
    }
  }


  function preload() {

    g.socket.emit('newPlayer', { mapId: g.mapId });

    game.load.tilemap('map:' + g.mapId, null, arrayToCSV(g.mapData[g.mapId]), Phaser.Tilemap.CSV);

  //  game.load.image('player', 'assets/player.png');
    game.load.spritesheet('player', 'assets/player.png', 64, 64);
    game.load.image('attack', 'assets/attack.png');
    game.load.image('block', 'assets/block.png');
    game.load.image('wall', 'assets/wall.png');
    game.load.image('ground', 'assets/ground.png');
    game.load.image('start', 'assets/startbutton.png');
  }


  function create() {

    g.map = game.add.tilemap('map:' + g.mapId, 64, 64);
    g.map.addTilesetImage('ground', 'ground', 64, 64, 0, 0, 0);
    g.map.addTilesetImage('wall', 'wall', 64, 64, 0, 0, 1);

    g.map.createLayer(0).resizeWorld();

    g.localPlayer = addPlayer(0, 0, g.sid);

    game.camera.follow(g.localPlayer);

    // HUD
    g.hud = game.add.group();
    g.hud.fixedToCamera = true;
    g.hud.classType = Phaser.Text;
    var statusText = g.hud.create(g.WIDTH - 100, 10, "Connected: " + g.connected + "\nLatency: " + g.latency);
    g.hud.statusText = 0;
    statusText.fontSize = 16;
    statusText.align = 'right';

    g.hud.create(20, 15, "Health: " + g.localPlayer.health);
    g.hud.healthText = 1;

    var middleText = g.hud.create(g.WIDTH / 2, g.HEIGHT / 2);
    g.hud.middleText = 2;
    middleText.anchor.setTo(0.5, 0.5);
    middleText.fontSize = 54;
    middleText.align = 'center';

    // Buttons
    $('#startButton').click(function onClick() {
      g.socket.emit('startGame', { mapId: g.mapId });
    });

    $('#resetButton').click(function onClick() {
      g.socket.emit('resetGame', { mapId: g.mapId });
    });

    g.initialized = true;
  }


  function update() {
    g.socket.emit('updatePlayer', {
      left: game.input.keyboard.isDown(Phaser.Keyboard.LEFT),
      up: game.input.keyboard.isDown(Phaser.Keyboard.UP),
      right: game.input.keyboard.isDown(Phaser.Keyboard.RIGHT),
      down: game.input.keyboard.isDown(Phaser.Keyboard.DOWN),
      a: game.input.keyboard.isDown(Phaser.Keyboard.A),
      s: game.input.keyboard.isDown(Phaser.Keyboard.S),
      d: game.input.keyboard.isDown(Phaser.Keyboard.D)
    });

    while (g.toAdd.length !== 0) {
      var data = g.toAdd.shift();
      var toAdd = addPlayer(cpc(data.x), cpc(data.y), data.id);
      g.remotePlayers.push(toAdd);
    }

    while (g.toRemove.length !== 0) {
      var toRemove = g.toRemove.shift();
      game.world.removeChild(toRemove, true);
    }

    // Update HUD
    g.hud.getAt(g.hud.statusText).text = "Connected: " + g.connected + "\nLatency: " + ~~(g.latency);
    g.hud.getAt(g.hud.healthText).text = "Health: " + ~~(g.localPlayer.health);

    if (g.isLeader && !g.gameStarted) {
      if ($('#startButton').prop('disabled')) {
        $('#startButton').prop('disabled', false);
      }
    }
    else if (!$('#startButton').prop('disabled')) {
      $('#startButton').prop('disabled', true);
    }

    if (g.isLeader && g.gameStarted) {
      if ($('#resetButton').prop('disabled')) {
        $('#resetButton').prop('disabled', false);
      }
    }
    else if (!$('#resetButton').prop('disabled')) {
      $('#resetButton').prop('disabled', true);
    }
  }


  function render() {
  }


  function addPlayer(x, y, id) {
    var player = game.add.group();
    player.name = 'Player';
    player.id = id;
    player.x = x;
    player.y = y;
    player.create(-32, -32, 'player');
    player.create(-32, -64, 'attack');
    player.create(-32, -64, 'block');
    player.getAt(1).visible = false;
    player.getAt(2).visible = false;

    var text = new Phaser.Text(game, 0, -54, player.name);
    player.add(text);
    text.align = 'center';
    text.fontSize = 16;
    text.anchor.setTo(0.5, 0.5);
    text.alpha = 0.6;

    if (id === g.sid) {
      text.fill = 'red';
    }

    player.getAt(0).animations.add('attack', [3], 0, true);
    player.getAt(0).animations.add('block', [4], 0, true);
    player.getAt(0).animations.add('dead', [5], 0, true);
    player.getAt(0).animations.add('walk', [0, 1, 0, 2], 10, true);
    return player;
  }


  /**
   * meter to px, player coordinates
   * "convert player coordinate"
   */
  function cpc(x) {
    return x * 64 + 32;
  }


  function playerById(id) {
    for (var i = 0; i < g.remotePlayers.length; i++) {
      if (g.remotePlayers[i].id === id) {
        return g.remotePlayers[i];
      }
    }
    return false;
  }


  function arrayToCSV(array2d) {
    return array2d.map(function(row) {
      return row.join(',');
    }).join('\n');
  }

})(window.g = window.g || {});
