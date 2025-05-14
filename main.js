const config = {
    type: Phaser.AUTO, // Use WebGL if available, otherwise Canvas
    width: 800,
    height: 600,
    parent: 'phaser-game', // ID of the div to contain the game
    physics: {
        default: 'arcade',
        arcade: {
            gravity: { y: 800 }, // Increased gravity
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
let score = 0;
let scoreText;
let treatSpawnTimer;
let backgroundTrees;
let treeSpawnTimer;
let platforms;
let platformSpawnTimer;
const baseScrollSpeed = 200; // Increased base speed
let gameSpeedMultiplier = 1.0; // Starts at 1x speed
const speedIncreaseInterval = 10000; // Increase speed every 10 seconds (10000ms)
const speedIncreaseAmount = 0.1; // Increase speed by 10%
let assetsLoaded = false; // Will be true if spritesheet loads
let treeLoaded = false;
let platformLoaded = false; // Flag for platform asset

function preload() {
    // Attempt to load puppy assets
    // Remove individual image loads
    // this.load.image('puppy1', 'assets/puppy1.png');
    // this.load.image('puppy2', 'assets/puppy2.png');
    // this.load.image('puppy3', 'assets/puppy3.png');
    this.load.spritesheet('puppy_run', 'assets/puppy_running_sprites.png', { frameWidth: 512, frameHeight: 512 }); // Load spritesheet

    this.load.image('ground', 'assets/platform.png'); // Assuming a ground asset, will fallback too
    this.load.image('treat', 'assets/treat.png');   // Assuming a treat asset
    this.load.image('tree', 'assets/tree3.png');     // << CHANGED to tree3.png
    this.load.image('platform', 'assets/platform.png'); // Try using platform.png for platforms too

    // Check if assets loaded successfully after preload finishes
    this.load.on('complete', () => {
        console.log('Load Complete. Checking textures...');
        // Check if spritesheet texture exists
        assetsLoaded = this.textures.exists('puppy_run');
        console.log('Puppy spritesheet (\'puppy_run\') exists:', assetsLoaded);

        const groundExists = this.textures.exists('ground');
        console.log('Ground texture exists:', groundExists);
        if (!groundExists) {
            console.log('Creating ground fallback texture.');
            // Create a placeholder ground texture if loading failed
            let graphics = this.add.graphics();
            graphics.fillStyle(0x8B4513, 1); // Brown color
            graphics.fillRect(0, 0, config.width, 32);
            graphics.generateTexture('ground_fallback', config.width, 32);
            graphics.destroy();
        }
         if (!this.textures.exists('treat')) {
            console.log('Creating treat fallback texture.');
            // Create a placeholder treat texture if loading failed
            let graphics = this.add.graphics();
            graphics.fillStyle(0xFFFF00, 1); // Yellow color
            graphics.fillCircle(16, 16, 16); // Simple circle treat
            graphics.generateTexture('treat_fallback', 32, 32);
            graphics.destroy();
        }
        // Check if tree loaded
        treeLoaded = this.textures.exists('tree');
        console.log('Tree texture (\'tree\') exists:', treeLoaded);

        // Check if platform loaded
        platformLoaded = this.textures.exists('platform');
        console.log('Platform texture exists:', platformLoaded);
        if (!platformLoaded) {
             console.log('Creating platform fallback texture.');
            // Create a placeholder platform texture if loading failed
            let graphics = this.add.graphics();
            graphics.fillStyle(0x8B4513, 1); // Brown color (match ground)
            graphics.fillRect(0, 0, 200, 20); // Longer rectangle platform
            graphics.generateTexture('platform_fallback', 200, 20);
            graphics.destroy();
        }
    });
}

function create() {
    // Set background color
    this.cameras.main.setBackgroundColor('#add8e6');

    // --- Background Elements (Trees) ---
    backgroundTrees = this.physics.add.group({
        allowGravity: false,
        immovable: true // Trees don't get pushed by anything
    });

    // --- Platforms Setup ---
    platforms = this.physics.add.group({
        allowGravity: false,
        immovable: true
    });

    // --- Ground Setup ---
    const groundTextureKey = this.textures.exists('ground') ? 'ground' : 'ground_fallback';
    // Ensure the fallback texture exists if original is missing
    if (!this.textures.exists(groundTextureKey)) {
        console.error('CRITICAL: Ground texture or fallback missing!');
        return; // Stop creation if no ground can be displayed
    }
    const groundHeight = this.textures.get(groundTextureKey).get(0).height;
    console.log(`Ground Setup: Texture=${groundTextureKey}, Height=${groundHeight}`); // <-- DEBUG LOG

    // Create a TileSprite for visual scrolling ground
    // Position its origin at 0,0 and place it at the bottom
    ground = this.add.tileSprite(0, config.height - groundHeight, config.width, groundHeight, groundTextureKey).setOrigin(0, 0);
    ground.setDepth(-2); // Set ground depth behind trees

    // Create an *invisible* static physics body for the player to stand on
    // It needs to be slightly above the visual bottom edge if your player sprite has empty space below it
    physicsGround = this.physics.add.staticGroup();
    // Place it at the same visual Y position as the top of the scrolling ground tile
    physicsGround.create(config.width / 2, config.height - groundHeight + (groundHeight / 2) , null) // Use null for texture
        .setSize(config.width, groundHeight) // Make it wide enough
        .setVisible(false); // Make it invisible


    // --- Player Setup ---
    const playerStartX = 100; // Keep player near the left
    const playerStartY = config.height - groundHeight - 100;

    if (assetsLoaded) {
        // Create player sprite from spritesheet
        player = this.physics.add.sprite(playerStartX, playerStartY, 'puppy_run');
        console.log('Player created from spritesheet');

        // Create the animation from the spritesheet
        this.anims.create({
            key: 'run',
            frames: this.anims.generateFrameNumbers('puppy_run', { start: 0, end: 3 }), // Use frames 0-3
            frameRate: 10, // Base frame rate
            repeat: -1
        });
        player.anims.play('run', true);
        console.log('Playing \'run\' animation');

    } else {
        // Fallback circle
        console.log('Using fallback player circle.');
        let graphics = this.add.graphics();
        graphics.fillStyle(0x8B4513, 1); // Brown circle
        graphics.fillCircle(20, 20, 20);
        graphics.generateTexture('player_fallback', 40, 40);
        graphics.destroy();
        player = this.physics.add.sprite(playerStartX, playerStartY, 'player_fallback');
    }

    player.setBounce(0.1);
    // Adjust physics body size AFTER scaling
    const scaleFactor = 0.25; // Make puppy smaller (adjust as needed)
    player.setScale(scaleFactor);

    // REVERT: Set body size to match the original spritesheet frame dimensions.
    // Phaser will scale this by scaleFactor (0.25), resulting in a 128x128 body.
    // The offset will default to (0,0) relative to the scaled sprite.
    const spriteFrameWidth = 512;
    const spriteFrameHeight = 512;
    player.body.setSize(spriteFrameWidth, spriteFrameHeight);
    console.log(`Player scaled to ${scaleFactor}. Body set to sprite frame size (${spriteFrameWidth}x${spriteFrameHeight}), will be scaled by Phaser. Default offset will apply.`);

    // Adjust offset to lower the puppy visually if it's floating
    // A negative Y offset shifts the body UP on the sprite, making the sprite appear LOWER.
    player.body.setOffset(0, -50); // X offset 0, Y offset -20 (was -10)
    console.log('Player body offset set to (0, -20) to lower visual appearance.');

    player.setCollideWorldBounds(true);
    // Prevent player from falling off the bottom - physicsGround handles this now
    this.physics.world.bounds.bottom = config.height - groundHeight;


    // Add collision between player and the invisible physics ground
    this.physics.add.collider(player, physicsGround);
    // Add collision between player and platforms
    this.physics.add.collider(player, platforms);

    // Input
    cursors = this.input.keyboard.createCursorKeys();

    // --- Treats Setup ---
    const treatTextureKey = this.textures.exists('treat') ? 'treat' : 'treat_fallback';
    treats = this.physics.add.group({
        allowGravity: false // Treats don't fall
    });

    // Add overlap detection between player and treats
    this.physics.add.overlap(player, treats, collectTreat, null, this);

    // --- UI Setup ---
    scoreText = this.add.text(16, 16, 'Treats: 0', { fontSize: '32px', fill: '#000' }).setScrollFactor(0); // Keep score fixed on screen

    // --- Timers ---
    treatSpawnTimer = this.time.addEvent({
        delay: 2000, // Spawn a treat every 2 seconds
        callback: spawnTreat,
        callbackScope: this,
        loop: true
    });

    // Timer to spawn trees (if loaded)
    if (treeLoaded) {
        treeSpawnTimer = this.time.addEvent({
            delay: Phaser.Math.Between(3000, 6000), // Spawn trees at variable intervals (3-6 seconds)
            callback: spawnTree,
            callbackScope: this,
            loop: true
        });
    } else {
        console.log('Tree asset not loaded, tree spawning disabled.');
    }

    // Timer to spawn platforms (if texture or fallback exists)
    const platformTextureKey = platformLoaded ? 'platform' : 'platform_fallback';
    if (this.textures.exists(platformTextureKey)) {
        platformSpawnTimer = this.time.addEvent({
            delay: Phaser.Math.Between(4000, 7000), // Spawn platforms less frequently than trees
            callback: spawnPlatform,
            callbackScope: this,
            loop: true
        });
    } else {
        console.log('Platform asset/fallback not loaded, platform spawning disabled.');
    }

    // Timer to increase game speed
    this.time.addEvent({
        delay: speedIncreaseInterval,
        callback: increaseSpeed,
        callbackScope: this,
        loop: true
    });
}

function update(time, delta) { // Pass time and delta
    // Calculate current scroll speed
    const currentScrollSpeed = baseScrollSpeed * gameSpeedMultiplier;

    // Scroll the visual ground texture
    ground.tilePositionX += (currentScrollSpeed / 60) * (delta / (1000/60)); // Adjust for delta time

    // Keep player X velocity zero - the world moves, not the player
    player.setVelocityX(0);

    // Jumping - Use JustDown and blocked.down
    if (Phaser.Input.Keyboard.JustDown(cursors.space) && player.body.blocked.down) {
        player.setVelocityY(-450); // Increased jump velocity
    }

    // --- Player Animation Control (Based on vertical movement if needed) ---
    // If assets loaded and animation exists
     if (assetsLoaded && player.anims) {
         // Play run animation if on ground and not already playing - Simplified
         // No need to check 'canAnimatePuppy' anymore
         if (player.body.blocked.down && player.anims.isPlaying && player.anims.currentAnim?.key !== 'run') {
              player.anims.play('run', true);
         }
         // Optional: Add a jump animation if not on ground
         // else if (!player.body.blocked.down) {
         //     player.anims.play('jump_animation_key', true); // If you have a jump animation
         // }

         // Adjust animation speed
         const runAnim = player.anims.get('run');
         if (runAnim) {
            runAnim.frameRate = 10 * gameSpeedMultiplier; // Speed up animation
         }
     }


    // Remove treats that go off-screen left
    treats.getChildren().forEach(treat => {
        if (treat.x < -50) {
            treat.destroy();
        }
    });

    // Remove trees that go off-screen left
    backgroundTrees.getChildren().forEach(tree => {
        // Simplify check: Use a fixed position slightly off-screen
        if (tree.x < -200) { 
            tree.destroy();
        }
    });

    // Remove platforms that go off-screen left
    platforms.getChildren().forEach(platform => {
        // Check if right edge of platform is off-screen left
        if (platform.x + platform.displayWidth < 0) { 
            platform.destroy();
        }
    });
}

// --- Helper Functions ---

function collectTreat(player, treat) {
    treat.destroy(); // Changed from disableBody to destroy directly
    score += 1;
    scoreText.setText('Treats: ' + score);
    // Optional: Add a sound effect here
    // this.sound.play('collectSound');
}

function spawnTreat() {
    const treatTextureKey = this.textures.exists('treat') ? 'treat' : 'treat_fallback';
    const groundTopY = config.height - ground.height; // Get the top Y coordinate of the ground
    const minY = config.height * 0.4; // Minimum spawn height
    const maxY = groundTopY - 50; // Max spawn height (slightly above ground)

    // Ensure min isn't greater than max if screen/ground height is small
    const spawnY = Phaser.Math.Between(Math.min(minY, maxY), maxY);

    const treat = treats.create(config.width + 50, spawnY, treatTextureKey);

    // --- Scaling Logic ---
    const targetTreatWidth = 50; // Desired width in pixels
    const originalWidth = treat.width; // Get original texture width
    const scale = targetTreatWidth / originalWidth; // Calculate scale factor
    treat.setScale(scale); // Apply calculated scale

    // --- Physics and Movement ---
    treat.setVelocityX(-baseScrollSpeed * gameSpeedMultiplier); // Apply speed multiplier
    treat.body.allowGravity = false;
    treat.setDepth(1); // Ensure treats render above ground potentially

    // Refresh the physics body to reflect the *new* scaling
    // Use the calculated scale to set the body size accurately
    treat.body.setSize(treat.width * scale, treat.height * scale);

    // Optional: Add slight random vertical movement or patterns later
}

function spawnTree() {
    if (!treeLoaded) return;
    // console.log('Attempting to spawn tree...'); // Remove previous log

    const groundTopY = config.height - ground.height; // Get the top Y coordinate of the ground
    console.log(`Spawning tree at groundTopY: ${groundTopY}`); // <-- DEBUG LOG

    const tree = backgroundTrees.create(config.width + 100, groundTopY, 'tree');
    console.log(`Tree created with key 'tree'. Initial display width: ${tree.displayWidth}`); // <-- DEBUG LOG

    // --- Position & Depth & Scale Variation ---
    tree.setOrigin(0.5, 1);
    const baseScale = 0.4; // Make trees smaller overall
    const scaleVariation = Phaser.Math.FloatBetween(0.8, 1.2); // 80% to 120% of base
    const finalScale = baseScale * scaleVariation;
    tree.setScale(finalScale);
    tree.setDepth(finalScale < baseScale ? -1.5 : -1); // Smaller trees further back

    // --- Movement (Parallax based on scale) ---
    // Smaller trees move slower (more parallax)
    // Map scale variation (e.g., 0.7 to 1.3) to scroll factor (e.g., 0.3 to 0.7)
    const minScrollFactor = 0.3;
    const maxScrollFactor = 0.7;
    const minScaleVar = 0.7; // Corresponds to minScrollFactor
    const maxScaleVar = 1.3; // Corresponds to maxScrollFactor
    // Linear interpolation: factor = minFactor + ( (scale - minScale) / (maxScale - minScale) ) * (maxFactor - minFactor)
    const treeScrollFactor = minScrollFactor + ((finalScale/baseScale - minScaleVar) / (maxScaleVar - minScaleVar)) * (maxScrollFactor - minScrollFactor);

    const treeScrollSpeed = baseScrollSpeed * Phaser.Math.Clamp(treeScrollFactor, minScrollFactor, maxScrollFactor) * gameSpeedMultiplier; // Clamp to be safe
    tree.setVelocityX(-treeScrollSpeed);
    tree.body.allowGravity = false;
    tree.body.immovable = true;

    // Refresh physics body for scaled size
    tree.body.setSize(tree.width * finalScale, tree.height * finalScale);
    console.log(`Tree scaled to ${finalScale}. Final display width: ${tree.displayWidth}`); // <-- DEBUG LOG

    /* // Remove previous detailed log
    console.log('Spawned Tree:', { 
        x: tree.x,
        y: tree.y,
        depth: tree.depth,
        visible: tree.visible,
        texture: tree.texture.key,
        scale: tree.scale
    });
    */

    // Reset the timer for the next tree with a new random delay
    if (treeSpawnTimer) { // Check if timer exists (in case treeLoaded becomes false mid-game)
        treeSpawnTimer.delay = Phaser.Math.Between(3000, 6000);
    }
}

function spawnPlatform() {
    const platformTextureKey = platformLoaded ? 'platform' : 'platform_fallback';
    if (!this.textures.exists(platformTextureKey)) return;

    const groundTopY = config.height - ground.height;
    const playerJumpVelocity = -450; // Match the NEW value set in update()
    // Estimate jump height based on gravity (simplified physics approximation)
    // height = (velocity^2) / (2 * gravity)
    const estimatedJumpHeight = (playerJumpVelocity * playerJumpVelocity) / (2 * config.physics.arcade.gravity.y);
    const platformWidth = this.textures.get(platformTextureKey).get(0).width;
    const buffer = 30; // How much buffer below max jump height

    // Spawn platforms within reachable jump height
    const minY = groundTopY - estimatedJumpHeight + buffer;     // Min height: Just reachable
    const maxY = groundTopY - (estimatedJumpHeight * 0.4); // Max height: Requires a decent jump
    const spawnY = Phaser.Math.Between(Math.max(100, minY), Math.max(150, maxY)); // Ensure reasonable bounds
    console.log(`Spawning platform. Estimated jump: ${estimatedJumpHeight.toFixed(0)}, Target Y range: ${minY.toFixed(0)} - ${maxY.toFixed(0)}, Actual Y: ${spawnY}`); // DEBUG Log

    const platform = platforms.create(config.width + platformWidth, spawnY, platformTextureKey);

    // --- Appearance --- 
    if (platformLoaded) {
        // If using the loaded image, scale it horizontally and tint it
        platform.setScale(2, 1); // Make it 2x wider
        platform.setTint(0x8B4513); // Tint it brown
        // IMPORTANT: Refresh body size after scaling
        platform.body.setSize(platform.width * 2, platform.height * 1).setOffset(0,0); 
    } // No need to scale/tint fallback as we created it with desired size/color

    // --- Physics --- 
    platform.setVelocityX(-baseScrollSpeed * gameSpeedMultiplier);
    // Make platform collidable only from the top
    platform.body.checkCollision.down = false;
    platform.body.checkCollision.left = false;
    platform.body.checkCollision.right = false;
    platform.body.checkCollision.up = true; // Only allow collision from top
    platform.body.immovable = true; // Ensure player doesn't push it

    // Reset the timer for the next platform with a new random delay
    if (platformSpawnTimer) {
        platformSpawnTimer.delay = Phaser.Math.Between(4000, 7000);
    }
}

function increaseSpeed() {
    gameSpeedMultiplier += speedIncreaseAmount;
    console.log(`Game speed increased to: ${gameSpeedMultiplier.toFixed(2)}x`);
    // Optional: Adjust other factors like spawn rates maybe?
    // treatSpawnTimer.delay = Math.max(500, 2000 / gameSpeedMultiplier); // Example: Decrease treat spawn delay
} 