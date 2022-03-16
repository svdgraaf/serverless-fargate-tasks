'use strict';
const path = require('path');

class ServerlessFargateTasks {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.service = serverless.service;
    this.provider = serverless.getProvider('aws');
    this.stage = this.provider.getStage();
    this.options = options || {};
    this.debug = this.options.debug || process.env.SLS_DEBUG;
    this.colors = get(this.serverless, 'processedInput.options.color', true);
    this.hooks = {
      'package:compileFunctions': this.compileTasks.bind(this)
    };
  }

  compileTasks() {
    const template = this.serverless.service.provider.compiledCloudFormationTemplate;
    const colors = this.colors;
    const options = this.serverless.service.custom.fargate;
    const debug = this.debug;
    const consoleLog = this.serverless.cli.consoleLog;

    if (debug) consoleLog(yellow('Fargate Tasks Plugin'));

    // add the cluster
    template['Resources']['FargateTasksCluster'] = {
      "Type": "AWS::ECS::Cluster",
      "Properties": {
        "CapacityProviders": ["FARGATE"],
        "ClusterName": `${this.service.service}-${this.stage}`
      }
    }

    this.validateRootProperties(options);

    // for each defined task, we create a task and point it to the created cluster
    Object.keys(options.tasks).forEach(identifier => {
      if (debug) consoleLog(yellow('Processing ' + identifier));

      if (!options.tasks[identifier].image) {
        throw new Error(`Required property 'image' missing from 'custom.fargate.${identifier}'`);
      }

      // get all override values, if they exists
      var override = options.tasks[identifier]['override'] || {}
      var container_override = override['container'] || {}
      var task_override = override['task'] || {}

      var name = options.tasks[identifier]['name'] || `${this.service.service}-${this.stage}-${identifier}`
      var normalizedIdentifier = this.provider.naming.normalizeNameToAlphaNumericOnly(identifier)

      // create a key/value list for the task environment
      let environment = []
      if(options.tasks[identifier].hasOwnProperty('environment')) {

        // when a global environment is set, we need to extend it
        var target_environment = options['environment'] || {}
        target_environment = Object.assign(target_environment, options.tasks[identifier].environment)

        Object.keys(target_environment).forEach(function(key,index) {
          let value = target_environment[key];
          environment.push({"Name": key, "Value": value})
        })
      }

      // create a key/value list for the task secrets
      let secrets = []
      if(options.tasks[identifier].hasOwnProperty('secrets')) {

        // when a global secrets is set, we need to extend it
        var target_secrets = options['secrets'] || {}
        target_secrets = Object.assign(target_secrets, options.tasks[identifier].secrets)

        Object.keys(target_secrets).forEach(function(key,index) {
          let value = target_secrets[key];
          secrets.push({"Name": key, "ValueFrom": value})
        })
      }

      // Create a loggroup for the logs
      const logGroupName = `ecs/${this.service.service}-${this.stage}-${identifier}`
      template['Resources'][`FargateTasksLogGroup${normalizedIdentifier}`] = {
        "Type": "AWS::Logs::LogGroup",
        "Properties": {
          "LogGroupName": logGroupName
        }
      }

      // create the container definition
      var definition = Object.assign({
        'Name': name,
        'Image': options.tasks[identifier]['image'],
        'Environment': environment,
        'Secrets': secrets,
        'LogConfiguration': {
          'LogDriver': 'awslogs',
          'Options': {
            'awslogs-region':{"Fn::Sub": "${AWS::Region}"},
            'awslogs-group': {"Fn::Sub": logGroupName},
            'awslogs-stream-prefix': identifier
          },
        },
        'Command': options.tasks[identifier]['command']
      }, container_override)

      var definitions = [definition];

      if (options.datadog) {
        if (!options.datadog.ssm_api_key) {
          throw new Error(`Required property 'ssm_api_key' missing from 'custom.fargate.datadog'`);
        } else {
          var datadog_agent_definition = {
            'Name': `${this.service.service}-${this.stage}-datadog-agent`,
            'Image': "public.ecr.aws/datadog/agent:latest",
            'Essential': options.datadog.essential || false,
            'Cpu': options.datadog.cpu || 10,
            'MemoryReservation': options.datadog.memory || 256,
            'Environment': [
              {"Name": "ECS_FARGATE", "Value": true},
              {"Name": "DD_DOGSTATSD_NON_LOCAL_TRAFFIC", "Value": options.datadog.statsd_enabled || false}
            ],
            'Secrets': [
              {"Name": "DD_API_KEY", "ValueFrom": options.datadog.ssm_api_key}
            ]
          }
          definitions.push(datadog_agent_definition);
        }
      }

      // create the task definition
      var task = {
        'Type': 'AWS::ECS::TaskDefinition',
        'Properties': Object.assign({
          'ContainerDefinitions': definitions,
          'Family': `${this.service.service}-${this.stage}-${identifier}`,
          'NetworkMode': 'awsvpc',
          'ExecutionRoleArn': override.role || options.role,
          'TaskRoleArn': override.role || options.role,
          'RequiresCompatibilities': ['FARGATE'],
          'Memory': options.tasks[identifier]['memory'] || "2.0GB",
          'Cpu': options.tasks[identifier]['cpu'] || 1024,
        }, task_override)
      }
      template['Resources'][normalizedIdentifier + 'Task'] = task
    });

    function yellow(str) {
      if (colors) return '\u001B[33m' + str + '\u001B[39m';
      return str;
    }
  }

  validateRootProperties(options) {
    if (!options.tasks) {
      throw new Error("Required property 'tasks' missing from 'custom.fargate'");
    } else if (!options.role) {
      Object.keys(options.tasks).forEach(identifier => {
        if (!options.tasks[identifier]['override'] || !options.tasks[identifier]['override']['role']) {
          throw new Error(`Required property 'role' missing from 'custom.fargate' or 'custom.fargate.${identifier}.override'.`);
        }
      });
    }
  }
}

function get(obj, path, def) {
  return path.split('.').filter(Boolean).every(step => !(step && (obj = obj[step]) === undefined)) ? obj : def;
}

module.exports = ServerlessFargateTasks;
