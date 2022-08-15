import React, { useEffect, useRef } from 'react';
import {
  ChakraProvider,
  Box,
  Text,
  Link,
  VStack,
  Code,
  Grid,
  theme,
  Skeleton,
  Button,
  useColorMode
} from "@chakra-ui/react"
import * as PIXI from "pixi.js"

import Easing from './easing';
import AnimationManager from './animationManager';

import {Ship, ShipOrient, Game, Field, Cell, ShipPosition, Player} from './model';
import { Figure } from './component/axie';
import { AxieDirection } from './component/types';
import { Color } from 'pixi-spine';
import { ColorModeSwitcher } from './ColorModeSwitcher';

function toggle_orient(orient?: ShipOrient): ShipOrient {
	switch(orient) {
		case 'h': return 'v';
		case 'v': return 'h';
		default: return 'h';
	}
}


// let game = new Game();
let game
var renderer;
var stage;
var textures;
var gameUI;
let figure1 : Figure
let figure2 : Figure

let current_view:  PIXI.DisplayObject | null = null;

var do_render = () => {
	if (renderer && current_view) {
    renderer.stage.removeChildren();
		renderer.stage.addChild(current_view);
	}
};


let animation_manager = new AnimationManager(do_render);

 function main() {
	console.log("Main")
	PIXI.Ticker.shared.autoStart = true;
	renderer = new PIXI.Application({
		width: 1800,
		height: 1000,
		transparent: true
	})


	stage = new PIXI.Container();
	PIXI.Loader.shared.reset()

	PIXI.Loader.shared
		.add("assets/sprites.json")
		.load(setup);


  document.body.appendChild(renderer.view);

  renderer.view.addEventListener("contextmenu", function (e) {
    e.preventDefault();
    return false;
  });
  return renderer
}

class ShipSprite extends PIXI.Sprite {			
	movingTo: PIXI.Point;	

	constructor(public readonly ship: Ship) {
		super(textures['ship_' + ship.length + '.png']);				
	}

	setOrientation(orient: ShipOrient) {
		if (orient == 'v') {						
			animation_manager.animate({
				obj: this,
				prop: 'rotation',
				start_v: this.rotation,
				d_v: Math.PI / 2 - this.rotation,
				easing: Easing.easeInOutSine,
				duration: 20
			})
			animation_manager.animate({
				obj: this.pivot,
				prop: 'y',
				start_v: this.pivot.y,
				d_v: this.height - this.pivot.y,
				easing: Easing.easeInOutSine,
				duration: 20
			})			
		} else {	
			animation_manager.animate({
				obj: this,
				prop: 'rotation',
				start_v: this.rotation,
				d_v: 0 - this.rotation,
				easing: Easing.easeInOutSine,
				duration: 20
			})
			animation_manager.animate({
				obj: this.pivot,
				prop: 'y',
				start_v: this.pivot.y,
				d_v: 0 - this.pivot.y,
				easing: Easing.easeInOutSine,
				duration: 20
			})									
		}
	}		

	moveAnimated(pos: PIXI.Point) {				
		if (pos.equals(this.position)) {
			return;
		}		
		if (this.movingTo && this.movingTo.equals(pos)) {
			return;
		}

		animation_manager.animate({
			obj: this,
			prop: 'x',
			start_v: this.x,
			d_v: pos.x - this.x,
			easing: Easing.easeInOutSine,
			duration: 20
		});

		animation_manager.animate({
			obj: this,
			prop: 'y',
			start_v: this.y,
			d_v: pos.y - this.y,
			easing: Easing.easeInOutSine,
			duration: 20
		});
	}
}

class FieldSprite extends PIXI.Sprite {
	field: Field = new Field(10, 10);	
	constructor() {
		super(textures['field.png']);		
	}

	pointToCell(p: PIXI.Point): Cell {
		const x = Math.floor(p.x / 20);
		const y = Math.floor(p.y / 20);
		return new Cell(x, y);
	}

	cellToPoint(c: Cell): PIXI.Point {
		return new PIXI.Point(c.x * 20, c.y * 20);
	}
}

class FieldView extends PIXI.Container {
	fieldSprite: FieldSprite;
	shipSprites: ShipSprite[] = [];
	shotSprites: {[x:number]: PIXI.Sprite}  = {};
	figure: Figure;

	constructor(readonly player: Player) {
		super();

		this.fieldSprite = new FieldSprite();				
		this.fieldSprite.interactive = true;
		this.addChild(this.fieldSprite);
		this.initFigure()


		for (let sh of game.shipsByPlayer(player)) {
			let sh_sp = new ShipSprite(sh);
			sh_sp.visible = false;
			this.shipSprites.push(sh_sp);
			this.addChild(sh_sp);
		}

		this.update();

		this.fieldSprite.on('mousemove', e => {
			if (e.target === this.fieldSprite) {
				let point = e.data.getLocalPosition(this);
				let cell = this.fieldSprite.pointToCell(point);
				this.emit('cell_mousemove', cell, point, e)
			}
		});

		this.fieldSprite.on('click', e => {
			if (e.target === this.fieldSprite) {
				let point = e.data.getLocalPosition(this);
				let cell = this.fieldSprite.pointToCell(point);
				this.emit('cell_click', cell, point, e)
			}
		})

		this.fieldSprite.on('rightclick', e=> {
			if (e.target === this.fieldSprite) {
				let point = e.data.getLocalPosition(this);
				let cell = this.fieldSprite.pointToCell(point);
				this.emit('cell_rightclick', cell, point, e)
			}
		})

		this.fieldSprite.on('mouseout', e=> {
			this.emit('field_mouseout', e);
		})
	}

	async initFigure(){
		let item = await Figure.fromAxieId(PIXI.Loader.shared, "11413696")
		if(item !== undefined){
			this.figure = item
		}
	}

	update() {
		for (let sh_sprite of this.shipSprites) {
			let sh = sh_sprite.ship;
			
			if (sh.position) {
				if (this.player == 'me') {
					sh_sprite.visible = true;
				} else {
					sh_sprite.visible = sh.hp <= 0;
				}
				sh_sprite.moveAnimated(this.fieldSprite.cellToPoint(sh.position.cell))				
				sh_sprite.setOrientation(sh.position.orient);
			} else {
				sh_sprite.visible = false;
			}				
		} 
		

		for (let shot of game.shotsByPlayer(this.player)) {
			let sh_sprite = this.shotSprites[shot.id];
			if (!sh_sprite) {
				let tex = shot.hit ? textures['hit.png'] : textures['miss.png'];				
				sh_sprite = new PIXI.Sprite(tex);
				this.addChild(sh_sprite);
				this.shotSprites[shot.id] = sh_sprite;
				sh_sprite.position = this.fieldSprite.cellToPoint(shot.cell);
				if (shot.auto) {					
					sh_sprite.alpha = 0.1;
				}
				animate_shot(sh_sprite);
			}
		}
	}
}

function animate_shot(sh_sprite: PIXI.Sprite) {
	sh_sprite.texture.baseTexture.scaleMode = PIXI.SCALE_MODES.NEAREST;
	
	sh_sprite.pivot.set(sh_sprite.width / 2, sh_sprite.height / 2)
	sh_sprite.position.set(sh_sprite.position.x + sh_sprite.width / 2, sh_sprite.position.y + sh_sprite.height / 2);
	
	animation_manager.animate({
		obj: sh_sprite.scale,
		prop:'x',
		start_v: 0,
		d_v: 1,
		easing: Easing.easeOutSine,
		duration: 20
	});	
}

class PlaceShipsControl extends PIXI.Container {	
	fieldView: FieldView = new FieldView('me');
	current_ship_sprite?: ShipSprite;
	current_ship: Ship | undefined;
		
	constructor () {
		super();		

		this.addChild(this.fieldView);
		
		this.fieldView.on('cell_mousemove', this._cell_mousemove.bind(this));
		this.fieldView.on('cell_click', this._click.bind(this));
		this.fieldView.on('cell_rightclick', this._right_click.bind(this));
		this.fieldView.on('field_mouseout', this._mouse_out.bind(this));

		this._pick_next_ship();
	}		

	autoplace() {
		game.autoplace('me');
		this.fieldView.update();
		this._render();
		this.emit('ships_placed');
	}

	_render() {	
		this.fieldView.update();
		do_render();
	}

	_move_ship(cell: Cell) {
		if (this.current_ship) {			
			if (this.current_ship.position) {
				this.current_ship.position = new ShipPosition(cell, this.current_ship.position.orient);
			} else {
				this.current_ship.position = new ShipPosition(cell, 'h');
			}			
		}
	}		

	_pick_next_ship() {
		let ship = game.shipsByPlayer('me').find(x => !x.position);
		console.log('_pick_next_ship', ship);
		if (ship) {
			this.current_ship = ship;
			this._render();
		} else {
			this.current_ship = undefined;	
			this.fieldView.update();
			this._render();		
			this.emit('ships_placed');
		}
	}

	_can_place() {	
		if (this.current_ship) {
			return game.isValidPlacement('me');
		}
		return false;		
	}

	_place() {
		if (this._can_place()) {			
			this._pick_next_ship();			
		}	
	}

	_cell_mousemove(cell, point) {		
		if (this.current_ship) {
			this._move_ship(cell);
			if (this._can_place()) {					
				renderer.view.style.cursor = 'pointer';
			} else {
				renderer.view.style.cursor = 'not-allowed';	
			}		
			this._render();				
		}		
	}	

	_mouse_out() {
		if (this.current_ship) {
			renderer.view.style.cursor = 'default';
			this.current_ship.position = undefined;		
			this._render();
		}
	}

	_click(e) {
		this._place();
	}

	_right_click(e) {
		if (this.current_ship) {			
			if (this.current_ship.position) {
				this.current_ship.position.orient = toggle_orient(this.current_ship.position.orient);
			} else {
				this.current_ship.position = new ShipPosition(new Cell(0, 0), 'h');
			}			
			this._render();			
		}
	}
}

type BattleFinished = (result: GameResult) => void;

class PlacingUi extends PIXI.Container {	
	field: PlaceShipsControl = new PlaceShipsControl();
	autoPlaceButton: PIXI.Text;	
	current_ship: ShipSprite | null;	
	constructor() {

		super();				
		this.addChild(this.field);
		this.field.position.set(10, 60);
		this.autoPlaceButton = new PIXI.Text(
			"Place ships automatically",
			{fontFamily: "sans-serif", fontSize:"32px", fill: "Black"}
		);
		this.autoPlaceButton.interactive = true;
		this.autoPlaceButton.buttonMode = true;
		this.autoPlaceButton.position.set(300, 60);

		this.addChild(this.autoPlaceButton);		

		this.autoPlaceButton.on('click', () => this.field.autoplace());
		
		this.field.on('ships_placed', ships => this.emit('ships_placed', ships));
	}	

	render2() {
		do_render();		
	}			
}

type GameResult = 'WIN' | 'LOSE';

class MyBattleField extends FieldView {
	constructor() {
		super('me');
	}
}

class TheirBattleField extends FieldView {		
	constructor() {
		super('ai');
		game.autoplace('ai');
		this.update();
	}
}



class BattleUi extends PIXI.Container
{
	field1: MyBattleField;
	field2: TheirBattleField;

	on_finished?: BattleFinished;

	constructor(ships: Ship[], on_finished?: BattleFinished){
		super();

		this.field1 = new MyBattleField();		
		this.field1.position.set(10, 60);
		figure1.position.set(100,400)
		
		this.addChild(this.field1);
		this.addChild(figure1)

		this.field2 = new TheirBattleField();
		this.field2.position.set(300, 60);
		figure2.position.set(400,400)

		this.addChild(this.field2);
		this.addChild(figure2)

		
		this.on_finished = on_finished;
		
		this.field2.on('click', this._click.bind(this));	

		this.field2.on('cell_click', cell => {
			let sh = game.addShot(cell, 'ai');
			this.field2.update();
			do_render();	
			if (sh) {
				console.log('Player shot at', cell.x, cell.y, sh.hit);
			}				
			if (sh && !sh.hit) {
				this.ai_shot();
			} 
			if (game.whichPlayerWon()) {
				this.emit('game_over');
			}
		});		

		

		do_render();	
	}

	private ai_shot() {
		while (true) {
			let c = game.randomCell();			
			let sh = game.addShot(c, 'me');
			if (sh) {
				console.log('Shot at', c.x, c.y, sh.hit);
			}
			if ((sh && !sh.hit) || game.whichPlayerWon()) {
				break;
			}
			this.field1.update();
			do_render();
		}
		this.field1.update();
		do_render();
	}	

	_click() {
		if (this.on_finished) {
			this.on_finished('WIN');
		}
	}
}

class GameOverView extends PIXI.Container {
	constructor(message: string) {
		super();
		let text = new PIXI.Text(
			message,
			{fontFamily: "sans-serif", fontSize:"32px", fill: "Black"}
		);		
		text.position.set(300, 60);
		this.addChild(text);

		this.interactive = true;
		this.buttonMode = true;
	}
}

class GameUi
{
	stage: PIXI.Container;

	placingUi: PlacingUi | null;
	battleUi: BattleUi | null;

	myField: PIXI.Sprite;
	otherField: PIXI.Sprite;
	myShips: PIXI.Sprite[];
	otherShips: PIXI.Sprite[];
	

	splash: PIXI.Container;
	playGame: PIXI.Sprite;

	playerWon = new GameOverView('You won!');
	playerLost = new GameOverView('You lost...');

	constructor(stage) {
		this.stage = stage;

		this.playerWon.on('click', () => this.toSplash());
		this.playerLost.on('click', () => this.toSplash());		

		this.splash = new PIXI.Container();
		this.splash.buttonMode = true;
		this.splash.interactive = true;
		this.splash.on("click", () => this.toPlacing());
		this.playGame = new PIXI.Text(
			"Start game",
			{fontFamily: "sans-serif", fontSize:"32px", fill: "Black"}
		);
		// this.playGame = new PIXI.Sprite(textures['play_game.png']);
		this.playGame.position.set(10, 10);
		this.splash.addChild(this.playGame);		
		this.toSplash();
	}

	placing_mouse_move() {

	}

	async toSplash() {		
		await getAxieFigures()

		game = new Game(figure1, figure2); 
		current_view = this.splash;
		do_render();		
	}

	toPlacing() {		
    console.log("To Placing")

		this.placingUi = new PlacingUi();	
		current_view = this.placingUi;
		do_render();		
		this.placingUi.on('ships_placed', ships => this.toBattle(ships));
	}

	toBattle(ships: Ship[]) {
		
		this.battleUi = new BattleUi(ships);
		current_view = this.battleUi;
		do_render();
		this.battleUi.on('game_over', () => this.toGameOver());
	}

	toGameOver() {
		switch (game.whichPlayerWon()) {
			case 'ai': current_view = this.playerLost; break;
			case 'me': current_view = this.playerWon; break;			
		}
		do_render();
	}	
}

async function setup() {
	textures = PIXI.Loader.shared.resources["assets/sprites.json"].textures;
	gameUI = new GameUi(stage);		
    let sprite = new PIXI.Sprite(textures['field.png'])

	console.log(figure1)
	game = new Game(figure1, figure2) 

	
	setTimeout(() => {
		// figure?.spineData.defaultSkin.attachments = 0xffaacc;
		// console.log(figure?.skeleton.slots[6].attachment["color"])
		// console.log(figure?.skeleton.slots)
		// let x = figure?.skeleton.slots.filter(o => Object.prototype.hasOwnProperty.call(o, 'currentSpriteName'))
		// let y = x?.filter(o=> o['currentSpriteName'].includes('tail'))
		// console.log(y)
		// y?.forEach(item => item.attachment['color'] ={r: 1, g: 0, b: 0, a: 1} )
		// renderer.stage.addChild(figure)

	}, 1000);
    // renderer.stage.addChild(stage2)
}

const getAxieFigures = async () => {
	figure1 = await Figure.fromAxieId(PIXI.Loader.shared, "11413696") as Figure
	figure1.scale.x *= AxieDirection.Right
	if (figure1.state.hasAnimation('action/run')) {
		figure1.state.setAnimation(0, 'action/run', true);
	}
	if (figure1.spineData.animations.find((item) => item.name.includes("action/mix/eyes-animation"))?.duration !== 0) {
		figure1.state.addAnimation(1, "action/mix/eyes-animation", true, 0)
	}
	if (figure1.spineData.animations.find((item) => item.name.includes("action/mix/ear-animation"))?.duration !== 0) {
		figure1.state.addAnimation(2, "action/mix/ear-animation", true, 0)
	}
	if (figure1.spineData.animations.find((item) => item.name.includes("action/mix/body-animation"))?.duration !== 0) {
		figure1.state.addAnimation(3, "action/mix/body-animation", true, 0)
	}
	if (figure1.spineData.animations.find((item) => item.name.includes("action/mix/normal-mouth-animation"))?.duration !== 0) {
		figure1.state.addAnimation(4, "action/mix/normal-mouth-animation", true, 0)
	}


	figure2 = await Figure.fromAxieId(PIXI.Loader.shared, "11413697") as Figure
	figure2.scale.x *= AxieDirection.Left
	if (figure2.state.hasAnimation('action/run')) {
		figure2.state.setAnimation(0, 'action/run', true);
	}
	if (figure2.spineData.animations.find((item) => item.name.includes("action/mix/eyes-animation"))?.duration !== 0) {
		figure2.state.addAnimation(1, "action/mix/eyes-animation", true, 0)
	}
	if (figure2.spineData.animations.find((item) => item.name.includes("action/mix/ear-animation"))?.duration !== 0) {
		figure2.state.addAnimation(2, "action/mix/ear-animation", true, 0)
	}
	if (figure2.spineData.animations.find((item) => item.name.includes("action/mix/body-animation"))?.duration !== 0) {
		figure2.state.addAnimation(3, "action/mix/body-animation", true, 0)
	}
	if (figure2.spineData.animations.find((item) => item.name.includes("action/mix/normal-mouth-animation"))?.duration !== 0) {
		figure2.state.addAnimation(4, "action/mix/normal-mouth-animation", true, 0)
	}
}

export default function App() {
  const ref = useRef<any>()

  useEffect(() => {


	getAxieFigures()
	setTimeout(() => {
		main()
	}, 2000);
  }, [])


  return (
    <ChakraProvider theme={theme}>
		  <ColorModeSwitcher aria-label='123'></ColorModeSwitcher>
      <div ref={ref} />
    </ChakraProvider>
  )
}