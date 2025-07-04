const config = {
    type: Phaser.AUTO, // Use WebGL if available, otherwise Canvas
    width: 800,
    height: 600,
    parent: 'phaser-game', // ID of the div to contain the game
    physics: {
        default: 'arcade',
        arcade: {
            gravity: { y: 1200 }, // Increased gravity for faster falling
            debug: false
        }
    },
    scene: {
        preload: preload,
        create: create,
        update: update
    }
};

const game = new Phaser.Game(config);

let player;
let cursors;
let ground; // This will be the visual, scrolling ground
let physicsGround; // Invisible platform for collision
let treats;
let treatsCollected = 0; // Renamed from score for clarity
let treatsMissed = 0;
const maxMissedTreats = 3;
let gameOver = false;
let gameOverText;
let restartButton;
let scoreText;
let treatSpawnTimer;
let backgroundTrees;
let treeSpawnTimer;
let platforms;
let platformSpawnTimer;
const baseScrollSpeed = 200; // User had changed this to 400, then reverted this part of the diff. Let's stick to 200 for now, can be adjusted.
let gameSpeedMultiplier = 1.0; // Starts at 1x speed
const speedIncreaseInterval = 10000; // Increase speed every 10 seconds (10000ms)
const speedIncreaseAmount = 0.1; // Increase speed by 10%

// --- Game State Variables ---
let gameMode = null; // null, 'singlePlayer', 'twoPlayer'
let isPaused = false;
let pauseTextDisplay = null;
// Add other 2P variables later: currentPlayer, player1Score, etc.

let assetsLoaded; // Explicit global declaration, will be set in preload complete
let treeLoaded = false;
let platformLoaded = false; // Flag for platform asset
let jumpsMade = 0;
const maxJumps = 2;

let turnText = null; // Initialize UI elements for start screen cleanup
let timerText = null;
let startButton1P = null;
let startButton2P = null;
let titleText = null;
let speedIncreaseTimer = null;
let player1Score = 0;
let player2Score = 0;
let currentPlayer = 1;
let isTurnActive = false;
let turnTimeLimit = 60000; // Assuming a default turnTimeLimit
let turnTimerEvent;

let backgroundMusic;
let boingSound;

function preload() {
    this.load.spritesheet('puppy_run', 'assets/puppy_running_sprites.png', { frameWidth: 512, frameHeight: 512 });
    this.load.image('ground', 'assets/ground.png');
    this.load.image('treat', 'assets/treat.png');
    this.load.image('tree', 'assets/tree3.png');
    this.load.image('platform', 'assets/platform.png');

    this.load.audio('boing', 'assets/boing.mp3');
    this.load.audio('birds', 'assets/birds.mp3');

    this.load.on('complete', () => {
        assetsLoaded = this.textures.exists('puppy_run');
        treeLoaded = this.textures.exists('tree');
        platformLoaded = this.textures.exists('platform');
        console.log(`Assets Loaded: Puppy: ${assetsLoaded}, Tree: ${treeLoaded}, Platform: ${platformLoaded}`);

        if (!this.textures.exists('ground')) {
            let g = this.add.graphics().fillStyle(0x8B4513,1).fillRect(0,0,config.width,32);
            g.generateTexture('ground_fallback', config.width, 32).destroy();
        }
        if (!this.textures.exists('treat')) {
            let g = this.add.graphics().fillStyle(0xFFFF00,1).fillCircle(16,16,16);
            g.generateTexture('treat_fallback', 32, 32).destroy();
        }
        if (!platformLoaded && this.textures && this.add) { 
            let g = this.add.graphics().fillStyle(0x8B4513,1).fillRect(0,0,200,20);
            g.generateTexture('platform_fallback', 200, 20).destroy();
        }
    });
}

function create() {
    this.cameras.main.setBackgroundColor('#add8e6');
    console.log("Create called. Current gameMode:", gameMode);

    if (!backgroundMusic) {
        backgroundMusic = this.sound.add('birds', { loop: true, volume: 0.5 });
        backgroundMusic.play();
    }
    
    if (gameMode === null) {
        displayStartScreen.call(this);
    } else {
        initializeMainGame.call(this); 
    }
}

function displayStartScreen() {
    console.log("Displaying Start Screen");
    cleanupStartScreenUI(); 

    titleText = this.add.text(config.width / 2, config.height / 2 - 100, 'POWER PUPS 🐶', {
        fontSize: '64px', fill: '#fff', stroke: '#000', strokeThickness: 4
    }).setOrigin(0.5);
    startButton1P = this.add.text(config.width / 2, config.height / 2 + 20, '1 Player', {
        fontSize: '40px', fill: '#0f0', backgroundColor: '#333', padding: { x: 15, y: 10 }
    }).setOrigin(0.5).setInteractive();
    startButton2P = this.add.text(config.width / 2, config.height / 2 + 90, '2 Players', {
        fontSize: '40px', fill: '#fb0', backgroundColor: '#333', padding: { x: 15, y: 10 }
    }).setOrigin(0.5).setInteractive();

    startButton1P.once('pointerdown', () => {
        console.log("1 Player button clicked");
        gameMode = 'singlePlayer';
        cleanupStartScreenUI();
        initializeMainGame.call(this); // Directly initialize the game
    });

    startButton2P.once('pointerdown', () => {
        console.log("2 Player button clicked, setting gameMode to twoPlayer");
        gameMode = 'twoPlayer'; 
        cleanupStartScreenUI();
        initializeMainGame.call(this); // Directly initialize the game
    });
}

function cleanupStartScreenUI() {
    if (titleText) titleText.destroy();
    if (startButton1P) startButton1P.destroy();
    if (startButton2P) startButton2P.destroy();
    titleText = null; startButton1P = null; startButton2P = null;
}

function initializeMainGame() {
    console.log(`[initializeMainGame] Initializing for mode: ${gameMode}`);
    
    // Reset core game state variables
    treatsCollected = 0; treatsMissed = 0; player1Score = 0; player2Score = 0; currentPlayer = 1;
    gameSpeedMultiplier = 1.0; jumpsMade = 0; gameOver = false;
    isTurnActive = (gameMode === 'singlePlayer');

    // Destroy old game objects and timers
    if (player && player.active) player.destroy(); player = null;
    if (treats) { treats.clear(true, true); treats.destroy(); treats = null;}
    if (platforms) { platforms.clear(true, true); platforms.destroy(); platforms = null;}
    if (backgroundTrees) { backgroundTrees.clear(true, true); backgroundTrees.destroy(); backgroundTrees = null;}
    if (scoreText) scoreText.destroy(); scoreText = null;
    if (gameOverText) gameOverText.destroy(); gameOverText = null;
    if (restartButton) restartButton.destroy(); restartButton = null;
    if (turnText) {turnText.destroy(); turnText = null;}
    if (timerText) {timerText.destroy(); timerText = null;}
    
    if (treatSpawnTimer) { treatSpawnTimer.destroy(); treatSpawnTimer = null; }
    if (treeSpawnTimer) { treeSpawnTimer.destroy(); treeSpawnTimer = null; }
    if (platformSpawnTimer) { platformSpawnTimer.destroy(); platformSpawnTimer = null; }
    if (speedIncreaseTimer) { speedIncreaseTimer.destroy(); speedIncreaseTimer = null; }
    if (turnTimerEvent) { turnTimerEvent.remove(false); turnTimerEvent = null; }

    // Reset pause state for the new game
    isPaused = false;
    if (pauseTextDisplay) { pauseTextDisplay.destroy(); pauseTextDisplay = null; }

    backgroundTrees = this.physics.add.group({ allowGravity: false, immovable: true });
    platforms = this.physics.add.group({ allowGravity: false, immovable: true });
    treats = this.physics.add.group({ allowGravity: false });

    const groundTextureKey = this.textures.exists('ground') ? 'ground' : 'ground_fallback';
    if (!this.textures.exists(groundTextureKey)) { console.error('CRITICAL: Ground texture missing!'); return; }
    const groundHeight = this.textures.get(groundTextureKey).get(0).height;
    ground = this.add.tileSprite(0, config.height - groundHeight, config.width, groundHeight, groundTextureKey).setOrigin(0,0).setDepth(-2);
    physicsGround = this.physics.add.staticGroup();
    physicsGround.create(config.width / 2, config.height - groundHeight + (groundHeight/2), null).setSize(config.width, groundHeight).setVisible(false);

    const playerStartX = 100; const playerStartY = config.height - groundHeight - 100;
    if (assetsLoaded) {
        player = this.physics.add.sprite(playerStartX, playerStartY, 'puppy_run');
        if (!this.anims.exists('run')) { 
            this.anims.create({ key: 'run', frames: this.anims.generateFrameNumbers('puppy_run', { start: 0, end: 3 }), frameRate: 10, repeat: -1 });
        }
        player.anims.play('run', true);
    } else {
        let graphics = this.add.graphics().fillStyle(0x8B4513, 1).fillCircle(20,20,20);
        graphics.generateTexture('player_fallback', 40,40).destroy();
        player = this.physics.add.sprite(playerStartX, playerStartY, 'player_fallback');
    }
    player.setBounce(0.2).setScale(0.25);
    player.body.setSize(512, 512); 
    player.body.setOffset(0, -50); 
    player.setCollideWorldBounds(true);
    player.setDepth(2);
    this.physics.world.setBounds(0, 0, config.width, config.height, true, true, true, false);
    this.physics.add.collider(player, physicsGround);
    this.physics.add.collider(player, platforms);
    cursors = this.input.keyboard.createCursorKeys();
    this.physics.add.overlap(player, treats, collectTreat, null, this);

    scoreText = this.add.text(16, 16, getScoreString(), { fontSize: '28px', fill: '#000', lineSpacing: 4 }).setScrollFactor(0);

    // Timers adjusted for gameMode
    let treatDelay = (gameMode === 'twoPlayer') ? 600 : 2000;
    let treeMinDelay = (gameMode === 'twoPlayer') ? 800 : 1500;
    let treeMaxDelay = (gameMode === 'twoPlayer' ? 2000 : 4000);
    let platformMinDelay = (gameMode === 'twoPlayer') ? 2000 : 4000;
    let platformMaxDelay = (gameMode === 'twoPlayer' ? 4000 : 7000);
    let initialTreeCount = (gameMode === 'twoPlayer') ? 8 : 5;

    treatSpawnTimer = this.time.addEvent({ delay: treatDelay, callback: spawnTreat, callbackScope: this, loop: true });
    if (treeLoaded) {
        treeSpawnTimer = this.time.addEvent({ delay: Phaser.Math.Between(treeMinDelay, treeMaxDelay), callback: spawnTree, callbackScope: this, loop: true });
        for (let i = 0; i < initialTreeCount; i++) { 
            spawnTree.call(this, Phaser.Math.Between(0, config.width * 1.5));
        }
    }
    const platTexKey = platformLoaded ? 'platform' : 'platform_fallback';
    if (this.textures.exists(platTexKey)) {
        platformSpawnTimer = this.time.addEvent({ 
            delay: Phaser.Math.Between(platformMinDelay, platformMaxDelay), 
            callback: spawnPlatform, callbackScope: this, loop: true 
        });
    }

    if (gameMode === 'singlePlayer') {
        speedIncreaseTimer = this.time.addEvent({ delay: speedIncreaseInterval, callback: increaseSpeed, callbackScope: this, loop: true });
    } else if (gameMode === 'twoPlayer') {
        turnText = this.add.text(config.width / 2, 30, '', { fontSize: '32px', fill: '#fff', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5).setScrollFactor(0);
        timerText = this.add.text(config.width - 100, 30, '', { fontSize: '32px', fill: '#fff', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5).setScrollFactor(0);
        startPlayerTurn.call(this);
    }
    gameOver = false; 

    // Setup ESC key listener for pause/resume
    this.input.keyboard.off('keydown-ESC'); // Remove previous listener to avoid duplicates
    this.input.keyboard.on('keydown-ESC', togglePauseState, this);
}

function update(time, delta) {
    if (gameMode === null || isPaused) return; // Stop updates if on start screen or paused
    if (gameOver || (gameMode === 'twoPlayer' && !isTurnActive) ) return;

    const currentScrollSpeed = (gameMode === 'twoPlayer' ? 450 : baseScrollSpeed) * (gameMode === 'twoPlayer' ? 1 : gameSpeedMultiplier);
    if (ground) ground.tilePositionX += (currentScrollSpeed / (1000/60)) * (delta / (1000/60));

    if (player && player.body) {
        player.setVelocityX(0);
        if (Phaser.Input.Keyboard.JustDown(cursors.space) && jumpsMade < maxJumps) {
            player.setVelocityY(-450);
            jumpsMade++;
        }
        if (player.body.blocked.down) jumpsMade = 0;
        if (assetsLoaded && player.anims && player.body.blocked.down && (!player.anims.isPlaying || player.anims.currentAnim?.key !== 'run') ) {
            player.anims.play('run', true);
        }
        const runAnim = player.anims.get('run');
        if (runAnim) runAnim.frameRate = 10 * (gameMode === 'singlePlayer' ? gameSpeedMultiplier : 1.8);
    }

    if (gameMode === 'twoPlayer' && isTurnActive && turnTimerEvent && timerText) {
        const remaining = Math.max(0, turnTimerEvent.getRemainingSeconds());
        timerText.setText(`Time: ${Math.ceil(remaining).toString()}`);
    }

    if (treats) {
        treats.getChildren().forEach(treat => {
            if (treat.x < -treat.displayWidth - 20) {
                treat.destroy();
                if (gameMode === 'singlePlayer' && !gameOver) {
                    treatsMissed++;
                    if(scoreText) scoreText.setText(getScoreString());
                    checkGameOver.call(this);
                }
            }
        });
    }
    if (backgroundTrees) {
        backgroundTrees.getChildren().forEach(tree => { if (tree.x < -tree.displayWidth - 50) tree.destroy(); });
    }
    if (platforms) {
        platforms.getChildren().forEach(platform => { if (platform.x + platform.displayWidth < 0) platform.destroy(); });
    }
}

function collectTreat(player, treat) {
    treat.destroy();
    if (!boingSound) {
        boingSound = this.sound.add('boing');
    }
    boingSound.play();
    if (gameMode === 'twoPlayer') {
        treatsCollected++; // This is for the current player's active turn
    } else { 
        treatsCollected++;
    }
    if(scoreText) scoreText.setText(getScoreString());
}

function spawnTreat() {
    if (!this.textures || !treats || !ground || !ground.texture || !this.textures.exists(ground.texture.key)) { console.warn("spawnTreat prerequisites not met"); return; }
    const treatTextureKey = this.textures.exists('treat') ? 'treat' : 'treat_fallback';
    const groundTopY = config.height - this.textures.get(ground.texture.key).get(0).height;
    const spawnY = Phaser.Math.Between(config.height * 0.4, groundTopY - 50);
    const treatObj = treats.create(config.width + 50, spawnY, treatTextureKey);
    if (!treatObj || !treatObj.width || treatObj.width === 0) { if(treatObj && treatObj.destroy) treatObj.destroy(); return; }
    const scale = 50 / treatObj.width;
    treatObj.setScale(scale).setDepth(1);
    const velX = -(gameMode === 'twoPlayer' ? 450 : baseScrollSpeed) * (gameMode === 'twoPlayer' ? 1 : gameSpeedMultiplier);
    treatObj.setVelocityX(velX);
    if(treatObj.body) treatObj.body.setAllowGravity(false).setSize(treatObj.width * scale, treatObj.height * scale);
}

function spawnTree(initialX = null) {
    if (!treeLoaded || !this.textures || !backgroundTrees || !ground || !ground.texture || !this.textures.exists(ground.texture.key)) { console.warn("spawnTree prerequisites not met"); return; }
    const groundTopY = config.height - this.textures.get(ground.texture.key).get(0).height;
    const initialXPos = initialX !== null ? initialX : config.width + Phaser.Math.Between(50, 200);
    const tree = backgroundTrees.create(initialXPos, groundTopY, 'tree');
    if (!tree) return;
    tree.setOrigin(0.5, 1);
    const layer = Phaser.Math.Between(1, 5);
    let treeBaseScale, treeDepth, treeParallaxFactor;
    switch (layer) {
        case 1: treeBaseScale = 0.25; treeDepth = -1.9; treeParallaxFactor = 0.2; break;
        case 2: treeBaseScale = 0.35; treeDepth = -1.7; treeParallaxFactor = 0.3; break;
        case 3: treeBaseScale = 0.5; treeDepth = -1.5; treeParallaxFactor = 0.5; break;
        case 4: treeBaseScale = 0.6; treeDepth = -1.3; treeParallaxFactor = 0.65; break;
        default: treeBaseScale = 0.75; treeDepth = -1.1; treeParallaxFactor = 0.8; break;
    }
    const finalScale = treeBaseScale * Phaser.Math.FloatBetween(0.9, 1.1);
    tree.setScale(finalScale).setDepth(treeDepth);
    const scrollSpeedVal = (gameMode === 'twoPlayer' ? 450 : baseScrollSpeed) * treeParallaxFactor * (gameMode === 'twoPlayer' ? 1 : gameSpeedMultiplier);
    tree.setVelocityX(-scrollSpeedVal);
    if (tree.body) tree.body.setAllowGravity(false).setImmovable(true).setSize(tree.width * finalScale, tree.height * finalScale);
    if (treeSpawnTimer && treeSpawnTimer.loop) {
        const treeDelayMin = gameMode === 'twoPlayer' ? 800 : 1500;
        const treeDelayMax = gameMode === 'twoPlayer' ? 2000 : 4000;
        treeSpawnTimer.delay = Phaser.Math.Between(treeDelayMin, treeDelayMax);
    }
}

function spawnPlatform() {
    if(!this.textures || !platforms || !ground || !ground.texture || !this.textures.exists(ground.texture.key)) {
        console.warn("spawnPlatform general prerequisites not met (textures, platforms group, ground)");
        return;
    }

    const platTexKey = platformLoaded ? 'platform' : 'platform_fallback';
    if (!this.textures.exists(platTexKey)) {
        console.warn(`spawnPlatform: Chosen texture key '${platTexKey}' does not exist.`);
        return;
    }

    // Platform visual and physics body height determination
    let platformTexture = this.textures.get(platTexKey);
    let platformFrame = platformTexture.get(0);
    let platformOriginalHeight = platformFrame.height; // 20 for fallback, 32 for platform.png
    let platformDisplayHeight = platformOriginalHeight; // Assuming Y scale is 1 for both cases after setup
    if (platTexKey === 'platform') {
        // platform.png is scaled (2,1), its display height remains its original texture height (32)
        platformDisplayHeight = 32;
    } else {
        platformDisplayHeight = 20; // Fallback is 20px high
    }
    const platformHalfHeight = platformDisplayHeight / 2;

    // Player jump mechanics (values derived from player setup and physics)
    const playerSpriteVisualHalfHeight = (512 * 0.25) / 2; // 64
    const playerBodyScaledOffsetY = (-50 * 0.25); // -12.5
    const playerFeetOffsetFromCenterY = -playerSpriteVisualHalfHeight - playerBodyScaledOffsetY + (512 * 0.25); // player.y to feet = 51.5
    
    const groundTextureHeight = this.textures.get(ground.texture.key).get(0).height;
    const groundTopYAbs = config.height - groundTextureHeight; // e.g., 568
    const playerYGroundCenter = groundTopYAbs - playerFeetOffsetFromCenterY; // e.g., 516.5

    const playerJumpV = -450;
    const estJumpHRise = (playerJumpV * playerJumpV) / (2 * config.physics.arcade.gravity.y); // Approx 84.375
    
    const playerYPeakCenter = playerYGroundCenter - estJumpHRise; // e.g., 432.125
    const playerFeetAtPeakY = playerYPeakCenter + playerFeetOffsetFromCenterY; // e.g., 483.625

    // Define target Y range for platform TOPS
    const lowestPlatTopTarget = playerFeetAtPeakY - 20; // Reachable from ground jump (20px margin)
    const highestPlatTopTarget = Math.max(120, playerFeetAtPeakY - estJumpHRise * 0.9); // Higher, but not off-screen (min top Y 120)

    // Convert top Y-range to center Y-range
    let spawnYMinCenter = highestPlatTopTarget + platformHalfHeight;
    let spawnYMaxCenter = lowestPlatTopTarget + platformHalfHeight;

    // Ensure min_center_y is not greater than max_center_y for Phaser.Math.Between
    if (spawnYMinCenter > spawnYMaxCenter) {
        // This could happen if estJumpHRise * 0.9 makes highestPlatTopTarget very low (e.g. below lowestPlatTopTarget)
        // Or if the screen top clamp (120) makes it higher than lowestPlatTopTarget
        // In such a case, let's make the range tighter or default to a safe spot
        console.warn("Platform Y range calculation resulted in min > max. Adjusting.");
        //spawnYMinCenter = spawnYMaxCenter - 50; // Create a small range below max
        // Fallback to a slightly narrower range based on lowestPlatTopTarget
        spawnYMinCenter = lowestPlatTopTarget + platformHalfHeight - 50; // 50px variation upwards from lowest
        spawnYMaxCenter = lowestPlatTopTarget + platformHalfHeight;
        if (spawnYMinCenter < 100 + platformHalfHeight) spawnYMinCenter = 100 + platformHalfHeight; // Absolute min
    }
    
    const finalSpawnY = Phaser.Math.Between(spawnYMinCenter, spawnYMaxCenter);

    const platAssetW = platformFrame.width;
    const platform = platforms.create(config.width + platAssetW / 2, finalSpawnY, platTexKey);
    if(!platform || !platform.body) return;
    platform.setDepth(0);

    if (platTexKey === 'platform' && this.textures.exists(platTexKey)) {
        const actualTextureWidth = platformFrame.width; // platform.png texture width (200)
        platform.setScale(2,1).setTint(0x8B4513);
        // Body size should use texture width * scale, and texture height * scale
        if(platform.body) platform.body.setSize(actualTextureWidth * 2, platformOriginalHeight * 1).setOffset(0,0);
    } else {
        // Fallback already has correct body size from its texture (200x20)
    }

    platform.setVelocityX(-(gameMode === 'twoPlayer' ? 450 : baseScrollSpeed) * (gameMode === 'twoPlayer' ? 1 : gameSpeedMultiplier));
    if(platform.body) {
        platform.body.setAllowGravity(false).setImmovable(true);
        platform.body.checkCollision.down = false; platform.body.checkCollision.left = false; platform.body.checkCollision.right = false; platform.body.checkCollision.up = true;
    }
    if (platformSpawnTimer && platformSpawnTimer.loop) {
        const platDelayMin = gameMode === 'twoPlayer' ? 2000 : 3000;
        const platDelayMax = gameMode === 'twoPlayer' ? 4000 : 5000;
        platformSpawnTimer.delay = Phaser.Math.Between(platDelayMin, platDelayMax);
    }
}

function increaseSpeed() {
    if (gameMode === 'singlePlayer') {
        gameSpeedMultiplier += speedIncreaseAmount;
        console.log(`Game speed S1P: ${gameSpeedMultiplier.toFixed(2)}x`);
    }
}

function getScoreString() {
    if (gameMode === 'twoPlayer') return `P1: ${player1Score} | P2: ${player2Score}\nTurn: P${currentPlayer} | Treats This Turn: ${treatsCollected}`;
    return `Collected: ${treatsCollected}\nMissed: ${treatsMissed}/${maxMissedTreats}`;
}

function checkGameOver() {
    if (gameMode === 'singlePlayer' && treatsMissed >= maxMissedTreats && !gameOver) {
        gameOver = true; console.log('Game Over! Single Player');
        isTurnActive = false;
        if (treatSpawnTimer) treatSpawnTimer.remove(false);
        if (treeSpawnTimer) treeSpawnTimer.remove(false);
        if (platformSpawnTimer) platformSpawnTimer.remove(false);
        if (speedIncreaseTimer) speedIncreaseTimer.remove(false);
        if (player) player.setVelocity(0,0).anims.stop();
        if (gameOverText) gameOverText.destroy();
        gameOverText = this.add.text(config.width/2, config.height/2 - 50, 'GAME OVER', {fontSize:'64px',fill:'#ff0000',stroke:'#000',strokeThickness:4}).setOrigin(0.5).setScrollFactor(0);
        if (restartButton) restartButton.destroy();
        restartButton = this.add.text(config.width/2, config.height/2 + 50, 'Restart', {fontSize:'48px',fill:'#0f0',backgroundColor:'#333',padding:{x:20,y:10}}).setOrigin(0.5).setInteractive().setScrollFactor(0);
        restartButton.once('pointerdown', () => { restartGame.call(this); });
    }
}

function restartGame() {
    console.log('Restarting (back to menu)...');
    gameMode = null;

    // Null out global references to Phaser game objects
    player = null;
    ground = null; 
    physicsGround = null; 
    treats = null;
    backgroundTrees = null;
    platforms = null;
    // Null out UI elements that might persist or cause issues
    // scoreText is recreated in initializeMainGame, but good to null here too.
    if (scoreText) {scoreText.destroy(); scoreText = null; }
    if (gameOverText) { gameOverText.destroy(); gameOverText = null; }
    if (restartButton) { restartButton.destroy(); restartButton = null; }
    if (turnText) { turnText.destroy(); turnText = null; }
    if (timerText) { timerText.destroy(); timerText = null; }
    
    // Clear timers
    if (treatSpawnTimer) { treatSpawnTimer.destroy(); treatSpawnTimer = null; }
    if (treeSpawnTimer) { treeSpawnTimer.destroy(); treeSpawnTimer = null; }
    if (platformSpawnTimer) { platformSpawnTimer.destroy(); platformSpawnTimer = null; }
    if (speedIncreaseTimer) { speedIncreaseTimer.destroy(); speedIncreaseTimer = null; }
    if (turnTimerEvent) { turnTimerEvent.remove(false); turnTimerEvent = null; }

    this.scene.restart();
}

// --- Two Player Mode Specific Functions ---
function startPlayerTurn() {
    console.log(`Starting turn for Player ${currentPlayer}`);
    isTurnActive = true;
    treatsCollected = 0; // Reset treats for this specific turn

    if (turnText) turnText.setText(`Player ${currentPlayer} Turn`);
    if (timerText) timerText.setText(`Time: ${turnTimeLimit / 1000}`);
    if (scoreText) scoreText.setText(getScoreString());

    if (player) {
        player.setPosition(100, config.height - (ground ? ground.height:32) - 100).setVelocity(0,0);
        if (!player.anims.isPlaying || player.anims.currentAnim?.key !== 'run') player.anims.play('run',true);
    } else {
        console.error("Player object is null in startPlayerTurn!"); return;
    }
    jumpsMade = 0;

    treats.clear(true, true);
    platforms.clear(true, true);
    backgroundTrees.clear(true, true);
    if (treeLoaded) {
        for (let i = 0; i < 8; i++) {
            spawnTree.call(this, Phaser.Math.Between(0, config.width * 1.5));
        }
    }

    if (turnTimerEvent) turnTimerEvent.remove(false);
    turnTimerEvent = this.time.delayedCall(turnTimeLimit, endPlayerTurn, [], this);

    if (treatSpawnTimer) treatSpawnTimer.destroy();
    treatSpawnTimer = this.time.addEvent({ delay: 600, callback: spawnTreat, callbackScope: this, loop: true });
    if (treeSpawnTimer) treeSpawnTimer.destroy();
    if (treeLoaded) {
        treeSpawnTimer = this.time.addEvent({ delay: Phaser.Math.Between(800, 2000), callback: spawnTree, callbackScope: this, loop: true });
    }
    if (platformSpawnTimer) platformSpawnTimer.destroy();
    const platKey = platformLoaded ? 'platform' : 'platform_fallback';
    if (this.textures.exists(platKey)){
        platformSpawnTimer = this.time.addEvent({delay: Phaser.Math.Between(2000,4000), callback: spawnPlatform, callbackScope: this, loop: true});
    }
}

function endPlayerTurn() {
    console.log(`Ending turn for Player ${currentPlayer}`);
    isTurnActive = false;
    if (turnTimerEvent) turnTimerEvent.remove(false);

    if (currentPlayer === 1) {
        player1Score = treatsCollected;
        console.log(`Player 1 ENDED. Turn Score: ${treatsCollected}, P1 Total: ${player1Score}`);
        currentPlayer = 2;
        if (turnText) turnText.setText('Player 2 Get Ready!');
        this.time.delayedCall(2500, () => startPlayerTurn.call(this), [], this);
    } else {
        player2Score = treatsCollected;
        console.log(`Player 2 ENDED. Turn Score: ${treatsCollected}, P2 Total: ${player2Score}`);
        endTwoPlayerGame.call(this);
    }
}

function endTwoPlayerGame() {
    console.log('Ending Two Player Game. Final Scores -> P1:', player1Score, 'P2:', player2Score);
    gameOver = true;
    isTurnActive = false;
    if (turnTimerEvent) turnTimerEvent.remove(false);

    if (treatSpawnTimer && treatSpawnTimer.loop) treatSpawnTimer.remove(false);
    if (treeSpawnTimer && treeSpawnTimer.loop) treeSpawnTimer.remove(false);
    if (platformSpawnTimer && platformSpawnTimer.loop) platformSpawnTimer.remove(false);

    if (player) { player.setVelocity(0,0).anims.stop(); }

    let winnerMsg = "";
    if (player1Score > player2Score) winnerMsg = "Player 1 Wins!";
    else if (player2Score > player1Score) winnerMsg = "Player 2 Wins!";
    else winnerMsg = "It's a Tie!";

    if (gameOverText) gameOverText.destroy();
    gameOverText = this.add.text(config.width/2, config.height/2 - 100, winnerMsg, {fontSize:'56px',fill:'#fff',stroke:'#000',strokeThickness:4}).setOrigin(0.5).setScrollFactor(0);
    this.add.text(config.width/2, config.height/2 - 20, `P1: ${player1Score} Treats`, {fontSize:'40px',fill:'#ddd',stroke:'#000',strokeThickness:3}).setOrigin(0.5).setScrollFactor(0);
    this.add.text(config.width/2, config.height/2 + 20, `P2: ${player2Score} Treats`, {fontSize:'40px',fill:'#ddd',stroke:'#000',strokeThickness:3}).setOrigin(0.5).setScrollFactor(0);

    if (restartButton) restartButton.destroy();
    restartButton = this.add.text(config.width/2, config.height/2 + 100, 'Main Menu', {fontSize:'48px',fill:'#0f0',backgroundColor:'#333',padding:{x:20,y:10}}).setOrigin(0.5).setInteractive().setScrollFactor(0);
    restartButton.once('pointerdown', () => {
        gameMode = null;
        this.scene.restart();
    });
}

function togglePauseState() {
    // Do not allow pausing on the start screen or if the game is over
    if (gameMode === null || gameOver) {
        return;
    }

    // In two-player mode, prevent pausing during the "Get Ready!" screen transition
    // This is a simple check; a more robust method might use a dedicated transition flag.
    if (gameMode === 'twoPlayer' && !isTurnActive && !isPaused) {
        // Heuristic: Check if the turnText indicates a "Get Ready!" message.
        if (turnText && turnText.text.includes('Get Ready')) {
            return;
        }
    }

    isPaused = !isPaused;

    if (isPaused) {
        // Pause the game
        this.physics.pause();
        if (player && player.anims) {
            player.anims.pause();
        }

        if (backgroundMusic) {
            backgroundMusic.pause();
        }

        if (treatSpawnTimer) treatSpawnTimer.paused = true;
        if (treeSpawnTimer && treeSpawnTimer.loop) treeSpawnTimer.paused = true;
        if (platformSpawnTimer && platformSpawnTimer.loop) platformSpawnTimer.paused = true;
        if (speedIncreaseTimer && gameMode === 'singlePlayer' && speedIncreaseTimer.loop) speedIncreaseTimer.paused = true;
        if (turnTimerEvent && gameMode === 'twoPlayer') turnTimerEvent.paused = true;


        if (pauseTextDisplay) pauseTextDisplay.destroy();
        pauseTextDisplay = this.add.text(config.width / 2, config.height / 2, 'PAUSED', {
            fontSize: '60px',
            fill: '#ffffff',
            backgroundColor: 'rgba(0,0,0,0.7)',
            padding: { x: 20, y: 10 },
            stroke: '#000000',
            strokeThickness: 3
        }).setOrigin(0.5).setScrollFactor(0).setDepth(100); // Ensure it's on top

    } else {
        // Resume the game
        this.physics.resume();
        if (player && player.anims && player.anims.isPaused) {
            player.anims.resume();
        }

        if (backgroundMusic) {
            backgroundMusic.resume();
        }

        if (treatSpawnTimer) treatSpawnTimer.paused = false;
        if (treeSpawnTimer && treeSpawnTimer.loop) treeSpawnTimer.paused = false;
        if (platformSpawnTimer && platformSpawnTimer.loop) platformSpawnTimer.paused = false;
        if (speedIncreaseTimer && gameMode === 'singlePlayer' && speedIncreaseTimer.loop) speedIncreaseTimer.paused = false;
        if (turnTimerEvent && gameMode === 'twoPlayer') turnTimerEvent.paused = false;

        if (pauseTextDisplay) {
            pauseTextDisplay.destroy();
            pauseTextDisplay = null;
        }
    }
}