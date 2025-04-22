import {
	IBinaryData,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeConnectionType,
} from "n8n-workflow";
import { Buffer } from 'buffer';


const getFileExtension = (mimeType: string): string => {
	const mimeToExt: {[key: string]: string} = {
		'image/jpeg': '.jpg',
		'image/jpg': '.jpg',
		'image/png': '.png',
		'image/gif': '.gif',
		'image/webp': '.webp',
		'image/svg+xml': '.svg',
		'application/pdf': '.pdf',
		'text/plain': '.txt',
		'text/csv': '.csv',
		'text/html': '.html',
		'audio/mpeg': '.mp3',
		'audio/mp3': '.mp3',
		'audio/wav': '.wav',
		'video/mp4': '.mp4',
		'application/json': '.json',
		'application/xml': '.xml',
		'application/zip': '.zip',
	};
	return mimeToExt[mimeType] || '.bin';
}

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
						description: "Unique identifier for caching dependencies. If not provided, CodeHarbor will use a global cache internally. Only set this if you want to isolate dependencies for this specific workflow.",
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
						displayName: "Process Binary Output",
						name: "processBinaryOutput",
						type: "boolean",
						default: true,
						description: "Whether to process binary data in the output to be usable directly without a Convert to file node",
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

		// Utility function to calculate file size from base64 string
		const calculateSizeFromBase64 = (base64String: string): number => {
			// Remove padding characters and calculate size
			const base64 = base64String.replace(/=/g, '');
			// Base64 represents 6 bits per character, so 4 characters = 3 bytes
			const sizeInBytes = Math.floor((base64.length * 3) / 4);
			return sizeInBytes;
		};

		// Utility function to create a proper binary file using n8n's helpers
		const processBinaryFile = async (value: any, itemIndex: number): Promise<{
			[key: string]: IBinaryData
		}> => {
			const binaryData: { [key: string]: IBinaryData } = {};

			for (const [key, val] of Object.entries<any>(value)) {
				if (val && typeof val === 'object' && val !== null &&
					'data' in val && typeof val.data === 'string' &&
					'mimeType' in val && typeof val.mimeType === 'string') {

					// Create a buffer from the base64 string
					const buffer = Buffer.from(val.data, 'base64');

					// Use n8n's built-in helper to create a binary file with proper view capabilities
					const fileExtension = getFileExtension(val.mimeType);
					const fileName = val.fileName || `file-${Date.now()}${fileExtension}`;

					// Store binary data using n8n's helper (which automatically sets up correct metadata)
					binaryData[key] = await this.helpers.prepareBinaryData(
						buffer,
						fileName,
						val.mimeType
					);
				}
			}
			return binaryData;
		};

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
					processBinaryOutput?: boolean;
				};
				const timeout = advancedOptions.timeout || 60000;
				const forceUpdate = advancedOptions.forceUpdate || false;
				const debug = advancedOptions.debug || false;
				const captureLogs = advancedOptions.captureLogs || false;
				const processBinaryOutput = advancedOptions.processBinaryOutput !== false; // Default to true if not specified

				// Create request body
				const requestBody: any = {
					code,
					items: inputItems,
					options: {
						timeout,
						forceUpdate,
						debug,
					},
				};
				
				// Only add cacheKey if it's provided by the user
				if (advancedOptions.cacheKey !== undefined) {
					requestBody.cacheKey = advancedOptions.cacheKey;
				}

				// Make API request to CodeHarbor service
				const response = await this.helpers.httpRequest({
					method: 'POST',
					url: credentials.url + '/execute',
					headers: {
						'Authorization': `Bearer ${credentials.apiKey}`,
					},
					body: requestBody,
				});

				// Process the response
				if (response.success) {
					if (Array.isArray(response.data)) {
						// Handle array of results - wrap each item in a result property
						// Use Promise.all instead of forEach to properly handle async operations
						await Promise.all(response.data.map(async (item, index) => {
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

							const outputItem: INodeExecutionData = {
								json: outputJson,
								pairedItem: index < items.length ? { item: index } : undefined,
							};

							// Process binary output if enabled and binary data exists in the result
							if (processBinaryOutput &&
								item &&
								typeof item === 'object' &&
								item !== null &&
								'binary' in item &&
								item.binary &&
								typeof item.binary === 'object') {

								try {
									// Process binary data using n8n's built-in helpers
									outputItem.binary = await processBinaryFile(item.binary, index);

									// Remove binary data from JSON to avoid duplication
									if (outputItem.json &&
										outputItem.json.result &&
										typeof outputItem.json.result === 'object' &&
										outputItem.json.result !== null &&
										'binary' in outputItem.json.result) {
										delete outputItem.json.result.binary;
									}
								} catch (error) {
									// If binary processing fails, log it but continue
									console.error('Failed to process binary data:', error);
								}
							}

							returnData.push(outputItem);
						}));
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

						const outputItem: INodeExecutionData = {
							json: outputJson,
							pairedItem: { item: 0 }
						};

						// Process binary output if enabled and binary data exists in the result
						if (processBinaryOutput &&
							response.data &&
							typeof response.data === 'object' &&
							response.data !== null &&
							'binary' in response.data &&
							response.data.binary &&
							typeof response.data.binary === 'object') {

							try {
								// Process binary data using n8n's built-in helpers
								outputItem.binary = await processBinaryFile(response.data.binary, 0);

								// Remove binary data from JSON to avoid duplication
								if (outputItem.json &&
									outputItem.json.result &&
									typeof outputItem.json.result === 'object' &&
									outputItem.json.result !== null &&
									'binary' in outputItem.json.result) {
									delete outputItem.json.result.binary;
								}
							} catch (error) {
								// If binary processing fails, log it but continue
								console.error('Failed to process binary data:', error);
							}
						}

						returnData.push(outputItem);
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
						processBinaryOutput?: boolean;
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

					const timeout = advancedOptions.timeout || 60000;
					const forceUpdate = advancedOptions.forceUpdate || false;
					const debug = advancedOptions.debug || false;
					const captureLogs = advancedOptions.captureLogs || false;
					const processBinaryOutput = advancedOptions.processBinaryOutput !== false; // Default to true if not specified

					// Create request body
					const requestBody: any = {
						code,
						items: inputItem, // Use the inputItem with binary data
						options: {
							timeout,
							forceUpdate,
							debug,
						},
					};
					
					// Only add cacheKey if it's provided by the user
					if (advancedOptions.cacheKey !== undefined) {
						requestBody.cacheKey = advancedOptions.cacheKey;
					}

					// Make API request to CodeHarbor service
					const response = await this.helpers.httpRequest({
						method: 'POST',
						url: credentials.url + '/execute',
						headers: {
							'Authorization': `Bearer ${credentials.apiKey}`,
						},
						body: requestBody,
					});

					// Process the response
					if (response.success) {
						if (Array.isArray(response.data)) {
							// Handle array of results
							// Use Promise.all instead of forEach to properly handle async operations
							await Promise.all(response.data.map(async (item) => {
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

								const outputItem: INodeExecutionData = {
									json: outputJson,
									pairedItem: { item: i }
								};

								// Process binary output if enabled and binary data exists in the result
								if (processBinaryOutput &&
									item &&
									typeof item === 'object' &&
									item !== null &&
									'binary' in item &&
									item.binary &&
									typeof item.binary === 'object') {

									try {
										// Process binary data using n8n's built-in helpers
										outputItem.binary = await processBinaryFile(item.binary, i);

										// Remove binary data from JSON to avoid duplication
										if (outputItem.json &&
											outputItem.json.result &&
											typeof outputItem.json.result === 'object' &&
											outputItem.json.result !== null &&
											'binary' in outputItem.json.result) {
											delete outputItem.json.result.binary;
										}
									} catch (error) {
										// If binary processing fails, log it but continue
										console.error('Failed to process binary data:', error);
									}
								}

								returnData.push(outputItem);
							}));
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

							const outputItem: INodeExecutionData = {
								json: outputJson,
								pairedItem: { item: i }
							};

							// Process binary output if enabled and binary data exists in the result
							if (processBinaryOutput &&
								response.data &&
								typeof response.data === 'object' &&
								response.data !== null &&
								'binary' in response.data &&
								response.data.binary &&
								typeof response.data.binary === 'object') {

								try {
									// Process binary data using n8n's built-in helpers
									outputItem.binary = await processBinaryFile(response.data.binary, i);

									// Remove binary data from JSON to avoid duplication
									if (outputItem.json &&
										outputItem.json.result &&
										typeof outputItem.json.result === 'object' &&
										outputItem.json.result !== null &&
										'binary' in outputItem.json.result) {
										delete outputItem.json.result.binary;
									}
								} catch (error) {
									// If binary processing fails, log it but continue
									console.error('Failed to process binary data:', error);
								}
							}

							returnData.push(outputItem);
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
