const Homey = require('homey');
const Mqtt = require('mqtt');
//const MqttAsync = require('./mqtt-async.js');
const MqttAsync = require('mqtt-async');



function connect(...args) {
    const Mqtt = require('mqtt');
    const MqttAsync = require('mqtt-async');

    return MqttAsync(Mqtt.connect(...args))
};





class MyApp extends Homey.App {


	async onInit() {

        this.config = require('./config.json');
		this.instances = {};
        this.capabilities = {};
        this.cache = {};
		this.api = await this.getApi();
		this.debug = this.log;

		this.debug(`Fetching devices...`);
		this.devices = await this.api.devices.getDevices();

		this.debug(`Fetching zones...`);
		this.zones = await this.api.zones.getZones();

		this.debug(`Fetching weather...`);
		this.weather = await this.api.weather.getWeather();

		this.name = await this.api.system.getSystemName();

        await this.cleanUp();

		this.log(`Connecting to MQTT broker ${this.config.mqtt.host}:${this.config.mqtt.port}.`);

		this.mqtt = MqttAsync(Mqtt.connect(this.config.mqtt.host, {
			username: this.config.mqtt.username,
			password: this.config.mqtt.password,
			port: this.config.mqtt.port
		}));


		this.mqtt.on('connect', async () => {
			this.log(`Connected to host ${this.config.mqtt.host}:${this.config.mqtt.port}.`);

            await this.setup();

            this.mqtt.on('message', async (topic, message) => {
                message = message.toString();

                let parts = topic.split('/');
                let capabilityID = parts.pop();
                let deviceID = parts.pop();
                let deviceCapabilityID = `${deviceID}/${capabilityID}`;
    
                try {
                    let instance = this.instances[deviceCapabilityID];
                    let capability = this.capabilities[deviceCapabilityID];

                    if (capability.setable) {
                        if (instance != undefined) {
                            try {
                                if (message != '') {
                                    let value = JSON.parse(message);                                
    
                                    this.instances[deviceCapabilityID] = undefined;
                                    this.debug(`Setting ${deviceCapabilityID} to ${value}`);
    
                                    await instance.setValue(value);
    
                                }
                            }
                            catch(error) {
                                this.log(`Could not set ${deviceCapabilityID} to ${message}. ${error.message}`);
                            }
        
                            this.instances[deviceCapabilityID] = instance;
                        }
                        else {
                            this.log(`Instance ${deviceCapabilityID} not found.`);
                        }

                    }
    
                }
                catch(error) {
                    this.log(error.message);
                }
    
        
    
            });
    

		});


 
	}

    cleanUp() {

        let options = this.config.mqtt;

        return new Promise((resolve, reject) =>  {
    
            let mqtt = null;
            let timer = null;
    
            let resetTimeout = (timeout = 1000) => {
                clearTimeout(timer);
    
                timer = setTimeout(() => {
                    if (mqtt != null) {
                        mqtt.end();
                    }
                    resolve();
                }, timeout);
            };
    
            mqtt = MqttAsync(Mqtt.connect(options.host, {
                username: options.username,
                password: options.password,
                port: options.port,
                topic: options.topic
            }));
    
            mqtt.on('connect', async () => {
                resetTimeout();
    
                mqtt.on('message', async (topic, message) => {
                    if (message != "") {
                        await mqtt.publish(topic, "", {retain:true});
                        resetTimeout();
                    }
                });
            
                await mqtt.subscribe(`${options.topic}/#`);
    
                
            });
    
            resetTimeout(5000);
        });
    }


	async publish(topic, value, debug = true) {

        if (debug)
            this.debug(`Publishing ${topic}:${value}.`);

		await this.mqtt.publish(`${this.config.mqtt.topic}/${topic}`, JSON.stringify(value), {retain:true});

	}

    async subscribe(topic) {

        this.debug(`Subscribing to topic ${topic}...`);
		await this.mqtt.subscribe(`${this.config.mqtt.topic}/${topic}`);

	}

    async setup() {

        this.instances = {};
        this.capabilities = {};

        this.debug(`Publishing current state.`);

        await this.publish(`devices`, this.devices, false);
        await this.publish(`zones`, this.zones, false);


        // Publish zones

        for (const id in this.zones) {
            await this.publish(`zones/${id}`, this.zones[id], false);
        }

        
        // Publish devices
        for (let [deviceID, device] of Object.entries(this.devices)) {

            let entries = Object.entries(device.capabilitiesObj);

            if (entries.length > 0) {
                await this.publish(`devices/${deviceID}`, device, false);

                for (let [capabilityID, capability] of entries) {
                    await this.publish(`devices/${deviceID}/${capabilityID}`, capability.value);
                }

            }
        }
        this.debug(`Finished publishing current state.`);

        this.debug(`Creating instances.`);

        for (let [deviceID, device] of Object.entries(this.devices)) {
	        for (let [capabilityID, capability] of Object.entries(device.capabilitiesObj)) {
 
                let deviceCapabilityID = `${deviceID}/${capabilityID}`;
                let topic = `devices/${deviceID}/${capabilityID}`;

                let instance = device.makeCapabilityInstance(capabilityID, (value) => {
                    this.publish(topic, value);
                });

                this.instances[deviceCapabilityID] = instance;
                this.capabilities[deviceCapabilityID] = capability;
			}
		}
        this.debug(`Finished creating instances.`);

        this.debug(`Subscribing to changes.`);

        for (let [deviceID, device] of Object.entries(this.devices)) {
	        for (let [capabilityID, capability] of Object.entries(device.capabilitiesObj)) {
                if (capability.setable || capability.getable) {
                    await this.subscribe(`devices/${deviceID}/${capabilityID}`);
                }
			}
		}

        this.debug(`Finished subscribing to changes.`);

    }

	async getApi() {
		const { HomeyAPIApp } = require('homey-api');

		if (!this.api) {
			this.api = new HomeyAPIApp({homey: this.homey});
		}

        return this.api;
	}



	
}

module.exports = MyApp;