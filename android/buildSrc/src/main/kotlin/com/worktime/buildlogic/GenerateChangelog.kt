package com.worktime.buildlogic

import org.gradle.api.DefaultTask
import org.gradle.api.file.DirectoryProperty
import org.gradle.api.file.RegularFileProperty
import org.gradle.api.tasks.InputFile
import org.gradle.api.tasks.OutputDirectory
import org.gradle.api.tasks.TaskAction
import org.gradle.process.ExecOperations
import javax.inject.Inject

abstract class GenerateChangelog @Inject constructor(private val execOperations: ExecOperations) : DefaultTask() {
    @get:InputFile
    abstract val script: RegularFileProperty

    @get:InputFile
    abstract val changelog: RegularFileProperty

    @get:InputFile
    abstract val releaseConfig: RegularFileProperty

    @get:InputFile
    abstract val version: RegularFileProperty

    @get:OutputDirectory
    abstract val outputDirectory: DirectoryProperty

    @TaskAction
    fun generate() {
        val output = outputDirectory.file("changelog.json").get().asFile
        output.parentFile.mkdirs()
        output.outputStream().use { stream ->
            execOperations.exec {
                commandLine("node", script.get().asFile.absolutePath, "export", "--audience", "app", "--platform", "android")
                standardOutput = stream
            }
        }
    }
}
