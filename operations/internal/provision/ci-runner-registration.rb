# Version-specific adapter for the pinned GitLab 19.5.3 image. The Go caller
# sends only bounded owner/ID parameters through stdin and projects fixed fields.
description = "ai-platform-paused-#{v.fetch('owner')}"
tag = "platform-paused-#{v.fetch('owner')}"
root = User.find_by!(username: 'root')
result = nil
Ci::Runner.transaction do
  if v.fetch('create')
    lock_id = Digest::SHA256.hexdigest(description)[0, 8].to_i(16) % 2147483647
    Ci::Runner.connection.execute("SELECT pg_advisory_xact_lock(#{lock_id})")
  end
  matches = Ci::Runner.where(description: description).limit(2).to_a
  raise 'PLATFORM_CI_RUNNER_REGISTRATION_CONFLICT' if matches.length > 1
  runner = matches.first
  expected = v.fetch('id')
  if expected > 0 && (runner.nil? || runner.id != expected)
    raise 'PLATFORM_CI_RUNNER_REGISTRATION_CHANGED'
  end
  if runner.nil? && v.fetch('create')
    response = Ci::Runners::CreateRunnerService.new(user: root, params: {
      runner_type: 'instance_type', description: description, paused: true,
      locked: true, run_untagged: false, access_level: 'ref_protected',
      maximum_timeout: 900, tag_list: [tag],
      maintenance_note: "AI Platform #{v.fetch('owner')}; paused; dedicated executor pending"
    }).execute
    raise 'PLATFORM_CI_RUNNER_REGISTRATION_FAILED' unless response.success?
    runner = response.payload.fetch(:runner)
  end
  if runner
    unless runner.runner_type == 'instance_type' && runner.creator_id == root.id &&
        runner.active == false && runner.locked == true && runner.run_untagged == false &&
        runner.access_level == 'ref_protected' && runner.maximum_timeout == 900 &&
        runner.tag_list.sort == [tag]
      raise 'PLATFORM_CI_RUNNER_POLICY_CHANGED'
    end
    result = { id: runner.id, paused: true, token_sha256: Digest::SHA256.hexdigest(runner.token),
               protected: true, run_untagged: false, scope: 'instance_type' }
    result[:token] = runner.token if v.fetch('create')
  end
end
STDOUT.puts('PLATFORM_RUNNER_JSON=' + JSON.generate(result))
