import {
	IAuthenticateGeneric,
	ICredentialType,
	INodeProperties,
	Icon,
} from 'n8n-workflow';

// Fix: Rename class to match exactly what n8n is looking for
export class CodeHarborServerApi implements ICredentialType {
	name = 'codeHarborServerApi'; // Keep lowercase for internal reference
	displayName = 'CodeHarbor Server API';
	icon: Icon = 'file:icon.svg'; // Added icon property
	properties: INodeProperties[] = [
		{
			displayName: 'Server URL',
			name: 'url',
			type: 'string',
			default: 'https://codeharbor.brorlandi.xyz',
			required: true,
		},
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
		},
	];
	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				'Authorization': '=Bearer {{$credentials.apiKey}}'
			},
		},
	};
}
