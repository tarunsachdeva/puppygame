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
const baseScrollSpeed = 400; // Increased base speed
let gameSpeedMultiplier = 1.0; // Starts at 1x speed
const speedIncreaseInterval = 10000; // Increase speed every 10 seconds (10000ms)
const speedIncreaseAmount = 0.1; // Increase speed by 10%

// --- Game State Variables ---
let gameMode = null; // null, 'singlePlayer', 'twoPlayer'
// Add other 2P variables later: currentPlayer, player1Score, etc.

let assetsLoaded; // Explicit global declaration, will be set in preload complete
let treeLoaded = false;
let platformLoaded = false; // Flag for platform asset
let jumpsMade = 0;
const maxJumps = 2;

function preload() {
    // Attempt to load puppy assets
    // this.load.image('puppy1', 'assets/puppy1.png');
    // this.load.image('puppy2', 'assets/puppy2.png');
    // this.load.image('puppy3', 'assets/puppy3.png');
    this.load.spritesheet('puppy_run', 'assets/puppy_running_sprites.png', { frameWidth: 512, frameHeight: 512 });

    this.load.image('ground', 'assets/platform.png');
    this.load.image('treat', 'assets/treat.png');
    this.load.image('tree', 'assets/tree3.png');
    this.load.image('platform', 'assets/platform.png');

    this.load.on('complete', () => {
        console.log('Load Complete. Checking textures...');
        assetsLoaded = this.textures.exists('puppy_run');
        console.log('Puppy spritesheet (\'puppy_run\') exists:', assetsLoaded);
        platformLoaded = this.textures.exists('platform');
        console.log('Platform texture exists:', platformLoaded);

        if (!this.textures.exists('ground')) {
            let graphics = this.add.graphics().fillStyle(0x8B4513, 1).fillRect(0, 0, config.width, 32);
            graphics.generateTexture('ground_fallback', config.width, 32).destroy();
        }
        if (!this.textures.exists('treat')) {
            let graphics = this.add.graphics().fillStyle(0xFFFF00, 1).fillCircle(16, 16, 16);
            graphics.generateTexture('treat_fallback', 32, 32).destroy();
        }
        if (!platformLoaded) {
            let graphics = this.add.graphics().fillStyle(0x8B4513, 1).fillRect(0, 0, 200, 20);
            graphics.generateTexture('platform_fallback', 200, 20).destroy();
        }
    });
}

function create() {
    this.cameras.main.setBackgroundColor('#add8e6');
    if (gameMode === null) {
        displayStartScreen.call(this);
    } else { 
        startGamePlay.call(this, gameMode); // Pass the selected mode
    }
}

function displayStartScreen() {
    cleanupStartScreenUI(); 
    titleText = this.add.text(config.width / 2, config.height / 2 - 100, 'Puppy Runner', {
        fontSize: '64px', fill: '#fff', stroke: '#000', strokeThickness: 4
    }).setOrigin(0.5);
    startButton1P = this.add.text(config.width / 2, config.height / 2 + 20, '1 Player', {
        fontSize: '40px', fill: '#0f0', backgroundColor: '#333', padding: { x: 15, y: 10 }
    }).setOrigin(0.5).setInteractive();
    startButton2P = this.add.text(config.width / 2, config.height / 2 + 90, '2 Players', {
        fontSize: '40px', fill: '#fb0', backgroundColor: '#333', padding: { x: 15, y: 10 }
    }).setOrigin(0.5).setInteractive();

    startButton1P.once('pointerdown', () => {
        gameMode = 'singlePlayer';
        cleanupStartScreenUI();
        startGamePlay.call(this, gameMode);
    });
    startButton2P.once('pointerdown', () => {
        gameMode = 'twoPlayer';
        cleanupStartScreenUI();
        startGamePlay.call(this, gameMode);
    });
}

function cleanupStartScreenUI() {
    if (titleText) titleText.destroy();
    if (startButton1P) startButton1P.destroy();
    if (startButton2P) startButton2P.destroy();
    titleText = null; startButton1P = null; startButton2P = null;
}

function startGamePlay(currentMode) {
    console.log('startGamePlay called with mode:', currentMode);
    // Reset core game state variables
    treatsCollected = 0; treatsMissed = 0; player1Score = 0; player2Score = 0; currentPlayer = 1;
    gameSpeedMultiplier = 1.0; jumpsMade = 0; gameOver = false; isTurnActive = false;

    // Clear previous game objects if any (important for restarts)
    if (backgroundTrees) backgroundTrees.clear(true, true);
    if (platforms) platforms.clear(true, true);
    if (treats) treats.clear(true, true);
    if (player) player.destroy();
    if (scoreText) scoreText.destroy();
    if (turnText) turnText.destroy();
    if (timerText) timerText.destroy();
    if (gameOverText) gameOverText.destroy();
    if (restartButton) restartButton.destroy();

    // Re-initialize groups for the new game session
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
        if (!this.anims.exists('run')) { // Create anim only if it doesn't exist
            this.anims.create({ key: 'run', frames: this.anims.generateFrameNumbers('puppy_run', { start: 0, end: 3 }), frameRate: 10, repeat: -1 });
        }
        player.anims.play('run', true);
    } else {
        let graphics = this.add.graphics().fillStyle(0x8B4513, 1).fillCircle(20,20,20);
        graphics.generateTexture('player_fallback', 40,40).destroy();
        player = this.physics.add.sprite(playerStartX, playerStartY, 'player_fallback');
    }
    player.setBounce(0.2).setScale(0.25);
    player.body.setSize(512, 512).setOffset(0, -50); // Using simplified offset from before
    player.setCollideWorldBounds(true);
    this.physics.world.setBounds(0, 0, config.width, config.height, true, true, true, false);
    this.physics.add.collider(player, physicsGround);
    this.physics.add.collider(player, platforms);
    cursors = this.input.keyboard.createCursorKeys();
    this.physics.add.overlap(player, treats, collectTreat, null, this);

    scoreText = this.add.text(16, 16, getScoreString(), { fontSize: '28px', fill: '#000', lineSpacing: 4 }).setScrollFactor(0);

    // Clear existing timers before creating new ones
    if (treatSpawnTimer) treatSpawnTimer.destroy();
    if (treeSpawnTimer) treeSpawnTimer.destroy();
    if (platformSpawnTimer) platformSpawnTimer.destroy();
    if (speedIncreaseTimer) speedIncreaseTimer.destroy();
    if (turnTimerEvent) turnTimerEvent.remove(false); // Use remove for delayedCall events

    if (currentMode === 'twoPlayer') {
        turnText = this.add.text(config.width / 2, 30, '', { fontSize: '32px', fill: '#fff', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5).setScrollFactor(0);
        timerText = this.add.text(config.width - 100, 30, '', { fontSize: '32px', fill: '#fff', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5).setScrollFactor(0);
        treatSpawnTimer = this.time.addEvent({ delay: 600, callback: spawnTreat, callbackScope: this, loop: true });
    } else { // singlePlayer
        treatSpawnTimer = this.time.addEvent({ delay: 2000, callback: spawnTreat, callbackScope: this, loop: true });
        speedIncreaseTimer = this.time.addEvent({ delay: speedIncreaseInterval, callback: increaseSpeed, callbackScope: this, loop: true });
    }

    if (treeLoaded) {
        const treeDelayMin = currentMode === 'twoPlayer' ? 800 : 1500;
        const treeDelayMax = currentMode === 'twoPlayer' ? 2000 : 4000;
        treeSpawnTimer = this.time.addEvent({ delay: Phaser.Math.Between(treeDelayMin, treeDelayMax), callback: spawnTree, callbackScope: this, loop: true });
        for (let i = 0; i < (currentMode === 'twoPlayer' ? 8 : 5); i++) { 
            spawnTree.call(this, Phaser.Math.Between(0, config.width * 1.5));
        }
    }
    const platTexKey = platformLoaded ? 'platform' : 'platform_fallback';
    if (this.textures.exists(platTexKey)) {
        platformSpawnTimer = this.time.addEvent({ 
            delay: Phaser.Math.Between(currentMode === 'twoPlayer' ? 2000 : 4000, currentMode === 'twoPlayer' ? 4000 : 7000), 
            callback: spawnPlatform, callbackScope: this, loop: true 
        });
    }
    
    gameOver = false; // Ensure this is false at the start of any game mode
    if (currentMode === 'twoPlayer') {
        startPlayerTurn.call(this);
    } else {
        isTurnActive = true;
    }
}

function update(time, delta) {
    if (gameMode === null) return;
    if (gameOver || (gameMode === 'twoPlayer' && !isTurnActive)) return;

    const currentScrollSpeedVal = (gameMode === 'twoPlayer' ? 450 : baseScrollSpeed) * (gameMode === 'twoPlayer' ? 1 : gameSpeedMultiplier);
    ground.tilePositionX += (currentScrollSpeedVal / 60) * (delta / (1000/60)); // Frame-rate independent scrolling
    player.setVelocityX(0);

    if (Phaser.Input.Keyboard.JustDown(cursors.space) && jumpsMade < maxJumps) {
        player.setVelocityY(-450); jumpsMade++;
    }

    if (player.body.blocked.down) jumpsMade = 0;
    if (assetsLoaded && player.anims && player.body.blocked.down && player.anims.isPlaying && player.anims.currentAnim?.key !== 'run') {
        player.anims.play('run', true);
    }
    const runAnim = player.anims.get('run');
    if (runAnim) runAnim.frameRate = 10 * (gameMode === 'singlePlayer' ? gameSpeedMultiplier : 1.8); // Faster base anim for 2P

    if (gameMode === 'twoPlayer' && isTurnActive && turnTimerEvent) {
        const remaining = Math.max(0, turnTimerEvent.getRemainingSeconds());
        timerText.setText(`Time: ${Math.ceil(remaining).toString()}`);
    }

    treats.getChildren().forEach(treat => {
        if (treat.x < -treat.displayWidth - 20) {
            treat.destroy();
            if (gameMode === 'singlePlayer' && !gameOver) {
                treatsMissed++; scoreText.setText(getScoreString()); checkGameOver.call(this);
            } 
        }
    });
    backgroundTrees.getChildren().forEach(tree => { if (tree.x < -tree.displayWidth - 50) tree.destroy(); });
    platforms.getChildren().forEach(platform => { if (platform.x + platform.displayWidth < 0) platform.destroy(); });
}

function collectTreat(player, treat) {
    treat.destroy();
    if (gameMode === 'twoPlayer') {
        treatsCollected++; // This will count for the current player's turn
    } else { // singlePlayer
        treatsCollected++;
    }
    scoreText.setText(getScoreString());
}

function spawnTreat() {
    const treatTextureKey = this.textures.exists('treat') ? 'treat' : 'treat_fallback';
    const groundTopY = config.height - this.textures.get(ground.texture.key).get(0).height;
    const spawnY = Phaser.Math.Between(config.height * 0.4, groundTopY - 50);
    const treat = treats.create(config.width + 50, spawnY, treatTextureKey);
    const scale = 50 / treat.width;
    treat.setScale(scale).setDepth(1);
    treat.setVelocityX(-(gameMode === 'twoPlayer' ? 450 : baseScrollSpeed) * (gameMode === 'twoPlayer' ? 1 : gameSpeedMultiplier));
    treat.body.setAllowGravity(false).setSize(treat.width * scale, treat.height * scale);
}

function spawnTree(initialX = null) {
    if (!treeLoaded) return;
    const groundTopY = config.height - this.textures.get(ground.texture.key).get(0).height;
    const initialXPos = initialX !== null ? initialX : config.width + Phaser.Math.Between(50, 200);
    const tree = backgroundTrees.create(initialXPos, groundTopY, 'tree').setOrigin(0.5, 1);
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
    tree.body.setAllowGravity(false).setImmovable(true).setSize(tree.width * finalScale, tree.height * finalScale);
    if (treeSpawnTimer) treeSpawnTimer.delay = Phaser.Math.Between(gameMode === 'twoPlayer' ? 800 : 1500, gameMode === 'twoPlayer' ? 2000 : 4000);
}

function spawnPlatform() {
    const platTexKey = platformLoaded ? 'platform' : 'platform_fallback';
    if (!this.textures.exists(platTexKey)) return;
    const groundTopY = config.height - this.textures.get(ground.texture.key).get(0).height;
    const playerJumpV = -450;
    const estJumpH = (playerJumpV * playerJumpV) / (2 * config.physics.arcade.gravity.y);
    const platAssetW = this.textures.get(platTexKey).get(0).width;
    const spawnY = Phaser.Math.Between(Math.max(100, groundTopY - estJumpH + 30), Math.max(150, groundTopY - (estJumpH * 0.4)));
    const platW = platformLoaded ? platAssetW : 200;
    const platform = platforms.create(config.width + platW / 2, spawnY, platTexKey);
    if (platformLoaded) {
        const scaledPlatWidth = platform.width * 2; // Store scaled width before setting body
        platform.setScale(2,1).setTint(0x8B4513);
        platform.body.setSize(scaledPlatWidth, platform.height).setOffset(0,0); // Use stored scaled width
    } // Fallback is already sized
    platform.setVelocityX(-(gameMode === 'twoPlayer' ? 450 : baseScrollSpeed) * (gameMode === 'twoPlayer' ? 1 : gameSpeedMultiplier));
    platform.body.setAllowGravity(false).setImmovable(true);
    platform.body.checkCollision.down = false; platform.body.checkCollision.left = false; platform.body.checkCollision.right = false; platform.body.checkCollision.up = true;
    if (platformSpawnTimer) platformSpawnTimer.delay = Phaser.Math.Between(gameMode === 'twoPlayer' ? 2000:3000, gameMode === 'twoPlayer' ? 4000:5000);
}

function increaseSpeed() {
    if (gameMode === 'singlePlayer') {
        gameSpeedMultiplier += speedIncreaseAmount;
        console.log(`Game speed S1P: ${gameSpeedMultiplier.toFixed(2)}x`);
    }
}

function getScoreString() {
    if (gameMode === 'twoPlayer') return `P1: ${player1Score} | P2: ${player2Score}`;
    return `Collected: ${treatsCollected}\nMissed: ${treatsMissed}/${maxMissedTreats}`;
}

function checkGameOver() {
    if (gameMode === 'singlePlayer' && treatsMissed >= maxMissedTreats && !gameOver) {
        gameOver = true; console.log('Game Over! Single Player');
        if (treatSpawnTimer) treatSpawnTimer.remove(false);
        if (treeSpawnTimer) treeSpawnTimer.remove(false);
        if (platformSpawnTimer) platformSpawnTimer.remove(false);
        if (speedIncreaseTimer) speedIncreaseTimer.remove(false);
        player.setVelocity(0,0).anims.stop();
        gameOverText = this.add.text(config.width/2, config.height/2 - 50, 'GAME OVER', {fontSize:'64px',fill:'#ff0000',stroke:'#000',strokeThickness:4}).setOrigin(0.5).setScrollFactor(0);
        restartButton = this.add.text(config.width/2, config.height/2 + 50, 'Restart', {fontSize:'48px',fill:'#0f0',backgroundColor:'#333',padding:{x:20,y:10}}).setOrigin(0.5).setInteractive().setScrollFactor(0);
        restartButton.once('pointerdown', () => { restartGame.call(this); });
    }
}

function restartGame() { 
    console.log('Restarting (back to menu)...');
    gameMode = null; // Reset to show start screen
    // No need to pass mode, create() will handle null gameMode
    this.scene.restart();
}

// --- Two Player Mode Specific Functions ---
function startPlayerTurn() {
    isTurnActive = true;
    treatsCollected = 0; // This tracks score for the CURRENT turn

    if (currentPlayer === 1) {
        turnText.setText('Player 1 Turn');
    } else {
        turnText.setText('Player 2 Turn');
    }
    timerText.setText(`Time: ${turnTimeLimit / 1000}`);
    scoreText.setText(getScoreString()); // Show P1 vs P2 scores

    player.setPosition(100, config.height - this.textures.get(ground.texture.key).get(0).height - 100).setVelocity(0,0);
    if (player.anims.currentAnim?.key !== 'run' || !player.anims.isPlaying) player.anims.play('run',true);
    jumpsMade = 0;
    treats.clear(true, true); platforms.clear(true, true);
    backgroundTrees.clear(true, true);
    if (treeLoaded) { 
        for (let i = 0; i < 8; i++) { 
            spawnTree.call(this, Phaser.Math.Between(0, config.width * 1.5)); 
        }
    }

    if (turnTimerEvent) turnTimerEvent.remove(false);
    turnTimerEvent = this.time.delayedCall(turnTimeLimit, endPlayerTurn, [], this);
    console.log(`Player ${currentPlayer} turn started. Target score var: P${currentPlayer}Score`);

    // Ensure spawn timers are specific for 2P turn
    if (treatSpawnTimer) treatSpawnTimer.remove(false); 
    treatSpawnTimer = this.time.addEvent({ delay: 600, callback: spawnTreat, callbackScope: this, loop: true });
    if (treeSpawnTimer) treeSpawnTimer.remove(false); 
    if (treeLoaded) {
        treeSpawnTimer = this.time.addEvent({ delay: Phaser.Math.Between(800, 2000), callback: spawnTree, callbackScope: this, loop: true });
    }
    if (platformSpawnTimer) platformSpawnTimer.remove(false); 
    const platTexKey = platformLoaded ? 'platform' : 'platform_fallback';
    if (this.textures.exists(platTexKey)){
        platformSpawnTimer = this.time.addEvent({delay: Phaser.Math.Between(2000,4000), callback: spawnPlatform, callbackScope: this, loop: true});
    }
}

function endPlayerTurn() {
    isTurnActive = false;
    if (turnTimerEvent) turnTimerEvent.remove(false);

    if (currentPlayer === 1) {
        player1Score = treatsCollected; // Store P1's score from this turn
        console.log(`Player 1 turn ENDED. Score for turn: ${treatsCollected}, P1 Total: ${player1Score}`);
        currentPlayer = 2;
        this.time.delayedCall(1500, () => startPlayerTurn.call(this), [], this);
    } else {
        player2Score = treatsCollected; // Store P2's score from this turn
        console.log(`Player 2 turn ENDED. Score for turn: ${treatsCollected}, P2 Total: ${player2Score}`);
        endTwoPlayerGame.call(this);
    }
}

function endTwoPlayerGame() {
    gameOver = true; 
    isTurnActive = false;
    if (turnTimerEvent) turnTimerEvent.remove(false);
    
    if (treatSpawnTimer && treatSpawnTimer.loop) treatSpawnTimer.remove(false);
    if (treeSpawnTimer && treeSpawnTimer.loop) treeSpawnTimer.remove(false);
    if (platformSpawnTimer && platformSpawnTimer.loop) platformSpawnTimer.remove(false);

    player.setVelocity(0,0).anims.stop();

    let winnerMsg = "";
    if (player1Score > player2Score) winnerMsg = "Player 1 Wins!";
    else if (player2Score > player1Score) winnerMsg = "Player 2 Wins!";
    else winnerMsg = "It's a Tie!";

    if (gameOverText) gameOverText.destroy(); // Clear previous if any
    gameOverText = this.add.text(config.width/2, config.height/2 - 80, winnerMsg, {fontSize:'56px',fill:'#fff',stroke:'#000',strokeThickness:4}).setOrigin(0.5).setScrollFactor(0);
    this.add.text(config.width/2, config.height/2, `P1: ${player1Score} - P2: ${player2Score}`, {fontSize:'40px',fill:'#fff',stroke:'#000',strokeThickness:3}).setOrigin(0.5).setScrollFactor(0);
    
    if (restartButton) restartButton.destroy();
    restartButton = this.add.text(config.width/2, config.height/2 + 100, 'Main Menu', {fontSize:'48px',fill:'#0f0',backgroundColor:'#333',padding:{x:20,y:10}}).setOrigin(0.5).setInteractive().setScrollFactor(0);
    restartButton.once('pointerdown', () => {
        gameMode = null; 
        this.scene.restart(); 
    });
}

// The main Phaser.Game instance remains the same as it references the 'config' object