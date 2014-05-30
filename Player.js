var p2 = require('p2');


/**
 * Represents player.
 * @constructor
 */
function Player(config) {

  /**
   * socket id.
   */
  this.id = config.id || '';

  /**
   * player name.
   */
  this.name = config.name || '';

  /**
   * Physics body.
   */
  this.body = new p2.Body({
    position: [config.x || 0, config.y || 0],
    mass: 1
  });
  this.body.owner = this;
  this.body.addShape(Player.SHAPE);
  this.body.damping = 0.7;
  this.body.material = Player.MATERIAL;

  /**
   * direction that player is facing
   */
  this.direction = config.direction || 0;

  /**
   * health.
   */
  this.health = config.health || 100;

  /**
   * default speed
   */
  this.defaultSpeed = config.defaultSpeed || 10;

  /**
   * player attacking
   * how long will the player attack in seconds
   */
  this.attackDurDefault = config.attackDurDefault || 0.3;
  this.attackDur = this.attackDurDefault;

  /**
   * attack damage
   */
  this.attackDamage = config.attackDamage || 25;

  /**
   * whether added action shape or not
   */
  this.actionShapeAdded = false;

  /**
   * Keys pressed.
   */
  this.keys = {
    left: false,
    up: false,
    right: false,
    down: false,
    a: false,
    s: false,
    d: false
  };
}


Object.defineProperties(Player.prototype, {
  attacking: {
    get: function() {
      return this.attackDur !== this.attackDurDefault && this.attackDur > 0;
    },
    enumerable: true
  },
  speed: {
    get: function() {
      return this.keys.a ? this.defaultSpeed * 2 : this.defaultSpeed;
    },
    enumerable: true
  },
  health: {
    get: function() {
      return this._health;
    },
    set: function(newValue) {
      this._health = newValue > 0 ? newValue : 0;
    },
    enumerable: true
  },
  alive: {
    get: function() {
      return this.health > 0;
    },
    enumerable: true
  },
  moving: {
    get: function() {
      return p2.vec2.length(this.body.velocity) > 0.05;
    }
  },
  blocking: {
    get: function() {
      return this._blocking;
    },
    set: function(newValue) {
      this._blocking = newValue;
      this.body.mass = newValue ? 1.5 : 1;
    },
    enumerable: true
  }
});


/**
 * Update.
 */
Player.prototype.update = function update(timeStep) {

  // Don't update if dead
  if (!this.alive) {
    return;
  }

  this.body.applyDamping(timeStep);

  // Prevent attacking and blocking at the same time
  if (this.keys.s) {
    this.attackDur -= timeStep;
    this.blocking = false;
  }
  else if (this.keys.d) {
    this.attackDur = this.attackDurDefault;
    this.blocking = true;
  }
  else {
    this.attackDur = this.attackDurDefault;
    this.blocking = false;
  }

  if (!this.actionShapeAdded && (this.attacking || this.blocking)) {
    this.body.addShape(Player.ACTION_SHAPE, [0, -0.75]);
    this.actionShapeAdded = true;
  }
  if (this.actionShapeAdded && !(this.attacking || this.blocking)) {
    this.body.removeShape(Player.ACTION_SHAPE);
    this.actionShapeAdded = false;
  }

  // TODO Optimize
  if (this.keys.left) {
    if (this.keys.up) {
      this.direction = -Math.PI / 4;
    }
    else if (this.keys.down) {
      this.direction = -Math.PI * 3 / 4;
    }
    else {
      this.direction = -Math.PI / 2;
    }
  }
  else if (this.keys.right) {
    if (this.keys.up) {
      this.direction = Math.PI / 4;
    }
    else if (this.keys.down) {
      this.direction = Math.PI * 3 / 4;
    }
    else {
      this.direction = Math.PI / 2;
    }
  }
  else {
    if (this.keys.up) {
      this.direction = 0;
    }
    else if (this.keys.down) {
      this.direction = Math.PI;
    }
  }

  if (!this.blocking && (this.keys.left || this.keys.up || this.keys.right || this.keys.down)) {
    this.body.force[0] = this.speed * Math.cos(this.direction - Math.PI / 2);
    this.body.force[1] = this.speed * Math.sin(this.direction - Math.PI / 2);
  }

  this.body.angle = this.direction;
};


/**
 * reset to the default
 */
Player.prototype.reset = function reset() {
  this.health = 100;
};


/**
 * Player joins a map.
 */
Player.prototype.joinMap = function joinMap(map) {
  this.body.position = map.getRandomPosition();
  this.mapId = map.mapId;
  map.addPlayer(this);
};


/**
 * Player leaves a map.
 */
Player.prototype.leaveMap = function leaveMap(map) {
  this.mapId = '';
  map.removePlayer(this);
};


/**
 * Update keys
 */
Player.prototype.updateKeys = function updateKeys(keys) {
  for (var property in this.keys) {
    if (this.keys.hasOwnProperty(property) && keys.hasOwnProperty(property)) {
      this.keys[property] = keys[property];
    }
  }
};


/**
 * get damage
 */
Player.prototype.damageWith = function damageWith(other) {
  if (other.attacking) {
    var damage = other.attackDamage + p2.vec2.length(other.body.velocity);
    if (this.blocking) {
      damage *= 0.75;
    }

    this.health -= damage;
  }
};


/**
 * Make object with only necessary information to send across network.
 */
Player.prototype.serialize = function serialize() {
  return {
    id: this.id,
    name: this.name,
    x: this.body.position[0],
    y: this.body.position[1],
    rotation: this.direction,
    attacking: this.attacking,
    blocking: this.blocking,
    health: this.health,
    moving: this.moving
  };
};


/**
 * Player's material
 */
Player.MATERIAL = new p2.Material();


/**
 * Player's shape
 * 1: wall
 * 2: player
 * 3: action
 */
Player.SHAPE = new p2.Circle(0.5);
Player.SHAPE.collisionGroup = Math.pow(2, 2);
Player.SHAPE.collisionMask = Math.pow(2, 1) | Math.pow(2, 2) | Math.pow(2, 3);

/**
 * attack and block shape
 * 1: wall
 * 2: player
 * 3: action
 */
Player.ACTION_SHAPE = new p2.Rectangle(1, 0.5);
Player.ACTION_SHAPE.collisionGroup = Math.pow(2, 3);
Player.ACTION_SHAPE.collisionMask = Math.pow(2, 2) | Math.pow(2, 3);


module.exports = Player;
