import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeConnectionType,
} from "n8n-workflow";

export class CodeHarbor implements INodeType {
	description: INodeTypeDescription = {
		displayName: "CodeHarbor",
		name: 'codeHarbor',
		icon: "file:icon.svg",
		group: ["transform"],
		version: 1,
		subtitle: 'Execute JavaScript code',
		description: "Execute JavaScript code with dependencies in a Docker container environment",
		defaults: {
			name: "CodeHarbor",
		},
		// eslint-disable-next-line n8n-nodes-base/node-class-description-inputs-wrong-regular-node
		inputs: [{
			type: NodeConnectionType.Main,
			// displayName: 'Input',
		}],
		// eslint-disable-next-line n8n-nodes-base/node-class-description-outputs-wrong
		outputs: [{
			type: NodeConnectionType.Main,
			// displayName: 'Output',
		}],
		credentials: [
			{
				name: 'codeHarborServerApi',
				required: true,
			},
		],
		requestDefaults: {
			headers: {
				Accept: "application/json",
				'Content-Type': 'application/json',
			},
			baseURL: "={{ $credentials.url }}",
		},
		properties: [
			// Mode selection
			{
				displayName: 'Mode',
				name: 'mode',
				type: 'options',
				options: [
					{
						name: 'Run Once for All Items',
						value: 'runOnceForAllItems',
					},
					{
						name: 'Run Once for Each Item',
						value: 'runOnceForEachItem',
					},
				],
				default: 'runOnceForAllItems',
				description: 'Whether to run the code once for all items or once for each item',
			},
			// Code execution properties - FOR ALL ITEMS mode
			{
				displayName: "Code",
				name: "code",
				type: "string",
				typeOptions: {
					editor: "jsEditor",
					editorLanguage: "javascript",
				},
				displayOptions: {
					show: {
						mode: [
							"runOnceForAllItems",
						]
					}
				},
				default: "// This function runs once and receives all items as an array\n// You can use external npm packages by requiring them\n\nmodule.exports = function(items) {\n  console.log('Processing batch of', items.length, 'items');\n  \n  // Process all items in a single execution\n  const results = items.map(item => {\n    // Process each item\n    console.log('Processing:', item);\n    \n    // Return a new object with processed data\n    return {\n      ...item,\n    };\n  });\n  \n  return results;\n};",
				description: "JavaScript code to execute. Must export a function that takes items array and returns processed data. You can use console.log for debugging.",
				required: true,
			},
			// Code execution properties - FOR EACH ITEM mode
			{
				displayName: "Code",
				name: "code",
				type: "string",
				typeOptions: {
					editor: "jsEditor",
					editorLanguage: "javascript",
				},
				displayOptions: {
					show: {
						mode: [
							"runOnceForEachItem",
						]
					}
				},
				default: "// This function runs once for each item\n// You can use external npm packages by requiring them\n\nmodule.exports = function(item) {\n  console.log('Processing item:', item);\n  \n  // Process the single item\n  const result = {\n    ...item,\n};\n  \n  return result;\n};",
				description: "JavaScript code to execute. Must export a function that takes a single item and returns processed data. You can use console.log for debugging.",
				required: true,
			},
			// Advanced Options Section
			{
				displayName: 'Advanced Options',
				name: 'advancedOptions',
				type: 'collection',
				default: {},
				placeholder: 'Add Option',
				options: [
					{
						displayName: "Cache Key",
						name: "cacheKey",
						type: "string",
						default: "={{ $workflow.id }}",
						description: "Unique identifier for caching dependencies",
					},
					{
						displayName: "Capture Console Logs",
						name: "captureLogs",
						type: "boolean",
						default: false,
						description: "Whether to include console logs in the output data",
					},
					{
						displayName: "Debug Mode",
						name: "debug",
						type: "boolean",
						default: false,
						description: "Whether to return detailed debug information about the execution",
					},
					{
						displayName: "Force Update Dependencies",
						name: "forceUpdate",
						type: "boolean",
						default: false,
						description: "Whether to force fresh installation of dependencies",
					},
					{
						displayName: "Input Items",
						name: "items",
						type: "json",
						displayOptions: {
							show: {
								"/mode": [
									"runOnceForEachItem",
								]
							}
						},
						default: "={{ $json }}",
						description: "The input data to pass to the JavaScript function for each item",
					},
					{
						displayName: "Timeout",
						name: "timeout",
						type: "number",
						default: 60000,
						description: "Maximum execution time in milliseconds",
					},
				],
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];
		const credentials = await this.getCredentials('codeHarborServerApi');
		const mode = this.getNodeParameter('mode', 0) as string;

		if (mode === 'runOnceForAllItems') {
			// Run code once for all items
			try {
				const code = this.getNodeParameter('code', 0) as string;

				// Process input items to include binary data
				const inputItems = await Promise.all(items.map(async (item, index) => {
					const itemJson = { ...item.json };

					// Add binary data if present
					if (item.binary) {
						itemJson.binary = {};
						for (const binaryPropertyName of Object.keys(item.binary)) {
							const binaryData = item.binary[binaryPropertyName];
							const binaryBuffer = await this.helpers.getBinaryDataBuffer(index, binaryPropertyName);
							itemJson.binary[binaryPropertyName] = {
								...binaryData,
								data: binaryBuffer.toString('base64'),
							};
						}
					}

					return itemJson;
				}));

				const advancedOptions = this.getNodeParameter('advancedOptions', 0) as {
					cacheKey?: string;
					timeout?: number;
					forceUpdate?: boolean;
					debug?: boolean;
					captureLogs?: boolean;
				};
				const cacheKey = advancedOptions.cacheKey || this.getWorkflow().id?.toString() || Math.random().toString();
				const timeout = advancedOptions.timeout || 60000;
				const forceUpdate = advancedOptions.forceUpdate || false;
				const debug = advancedOptions.debug || false;
				const captureLogs = advancedOptions.captureLogs || false;

				// Make API request to CodeHarbor service
				const response = await this.helpers.httpRequest({
					method: 'POST',
					url: credentials.url + '/execute',
					headers: {
						'Authorization': `Bearer ${credentials.apiKey}`,
					},
					body: {
						code,
						items: inputItems,
						cacheKey,
						options: {
							timeout,
							forceUpdate,
							debug,
						},
					},
				});

				// Process the response
				if (response.success) {
					if (Array.isArray(response.data)) {
						// Handle array of results - wrap each item in a result property
						response.data.forEach((item, index) => {
							const outputJson: Record<string, any> = {
								result: item
							};

							// Add debug info if requested
							if (debug && response.debug) {
								outputJson._debug = response.debug;
							}

							// Add console logs if capture is enabled
							if (captureLogs && Array.isArray(response.console) && response.console.length > 0) {
								outputJson._console = response.console;
							}

							returnData.push({
								json: outputJson,
								pairedItem: index < items.length ? { item: index } : undefined,
							});
						});
					} else {
						// Handle single result - wrap in a result property
						const outputJson: Record<string, any> = {
							result: response.data
						};

						// Add debug info if requested
						if (debug && response.debug) {
							outputJson._debug = response.debug;
						}

						// Add console logs if capture is enabled
						if (captureLogs && Array.isArray(response.console) && response.console.length > 0) {
							outputJson._console = response.console;
						}

						returnData.push({
							json: outputJson,
							pairedItem: { item: 0 }
						});
					}
				} else {
					const error = {...response}
					error.message = response.error;
					throw error;
				}
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: {
							error: error.message,
						},
						pairedItem: { item: 0 },
					});
				} else {
					throw error;
				}
			}
		} else {
			// Run code once for each item
			for (let i = 0; i < items.length; i++) {
				try {
					const code = this.getNodeParameter('code', i) as string;
					const advancedOptions = this.getNodeParameter('advancedOptions', i) as {
						items?: any;
						cacheKey?: string;
						timeout?: number;
						forceUpdate?: boolean;
						debug?: boolean;
						captureLogs?: boolean;
						};

					// Process the input item to include binary data
					let inputItem = advancedOptions.items || { ...items[i].json };

					// Add binary data if present
					if (items[i].binary) {
						if (typeof inputItem !== 'object' || inputItem === null) {
							inputItem = {};
						}

						inputItem.binary = {};
						for (const binaryPropertyName of Object.keys(items[i].binary)) {
							const binaryData = items[i].binary[binaryPropertyName];
							const binaryBuffer = await this.helpers.getBinaryDataBuffer(i, binaryPropertyName);
							inputItem.binary[binaryPropertyName] = {
								...binaryData,
								data: binaryBuffer.toString('base64'),
							};
						}
					}

					const cacheKey = advancedOptions.cacheKey || this.getWorkflow().id?.toString() || Math.random().toString();
					const timeout = advancedOptions.timeout || 60000;
					const forceUpdate = advancedOptions.forceUpdate || false;
					const debug = advancedOptions.debug || false;
					const captureLogs = advancedOptions.captureLogs || false;

					// Make API request to CodeHarbor service
					const response = await this.helpers.httpRequest({
						method: 'POST',
						url: credentials.url + '/execute',
						headers: {
							'Authorization': `Bearer ${credentials.apiKey}`,
						},
						body: {
							code,
							items: inputItem, // Use the inputItem with binary data
							cacheKey,
							options: {
								timeout,
								forceUpdate,
								debug,
							},
						},
					});

					// Process the response
					if (response.success) {
						if (Array.isArray(response.data)) {
							// Handle array of results
							response.data.forEach(item => {
								const outputJson: Record<string, any> = {
									result: item
								};

								// Add debug info if requested
								if (debug && response.debug) {
									outputJson._debug = response.debug;
								}

								// Add console logs if capture is enabled
								if (captureLogs && Array.isArray(response.console) && response.console.length > 0) {
									outputJson._console = response.console;
								}

								returnData.push({
									json: outputJson,
									pairedItem: { item: i }
								});
							});
						} else {
							// Handle single result
							const outputJson: Record<string, any> = {
								result: response.data
							};

							// Add debug info if requested
							if (debug && response.debug) {
								outputJson._debug = response.debug;
							}

							// Add console logs if capture is enabled
							if (captureLogs && Array.isArray(response.console) && response.console.length > 0) {
								outputJson._console = response.console;
							}

							returnData.push({
								json: outputJson,
								pairedItem: { item: i }
							});
						}
					} else {
						const error = {...response}
						error.message = response.error;
						throw error;
					}
				} catch (error) {
					if (this.continueOnFail()) {
						returnData.push({
							json: {
								error: error.message,
							},
							pairedItem: { item: i },
						});
					} else {
						throw error;
					}
				}
			}
		}

		return [returnData];
	}
}
