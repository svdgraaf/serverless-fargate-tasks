Serverless Fargate Tasks
------------------------
This Serverless plugin will setup a Fargate cluster and setup services and tasks.
With this plugin it's fairly easy to setup a (long running) task which would hook up to kinesis streams or SQS endpoints.

The (minimal) config is as follows:

```
custom:
  fargate:
    role: arn:aws:iam::123456789369:role/myRole
  
    tasks:
      my-task:
        image: 123456789369.dkr.ecr.eu-west-1.amazonaws.com/my-image
```

Of course, you can customize to your hearts desire, here are all the available options:

```
custom:
  fargate:
    # you can put global environment variables here, these will be added
    # to all tasks. Optional of course.
    environment:
      foo: bar

    role: arn:aws:iam::123456789369:role/myRole

    tasks:
      my-task:
        name: ${self:service}-${self:provider.stage}-my-task # default will be ${self:service}-${self:provider.stage}-{task-key-here}
        image: 123456789369.dkr.ecr.eu-west-1.amazonaws.com/my-image
        environment:  # optional
          platypus: true
          # local variables will always override global ones
          foo: wut
          # you can also use cloudformation references with eg serverless-pseudo-parameters
          myArn: #{MyResource.Arn}
        cpu: 512  # optional, defaults to 100% -> 1024, see cloudformation docs for valid values
        memory: 2.0GB  # optional, defaults to 1.0GB
```

Advanced usage
--------------
You can override the generated CF task, container, and role properties per task with the `override` properties:

```
custom:
  fargate:
    role: arn:aws:iam::123456789369:role/myRole
    
    tasks:
      my-task:
        image: 123456789369.dkr.ecr.eu-west-1.amazonaws.com/my-image

        # these are all optional
        override:
          task:
            Foo: BAR
          container:
            Foo: Bar
          role: ARN
```
