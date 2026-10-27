


const fs = require('fs')
const fsPromise = require('fs/promises')



// ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ---- ----



class DefaultFileOps {

    constructor() {

    }

    async readFilePromise(file_path) {
        return fsPromise.readFile(file_path)
    }


    writeFileSync(fname,flat_message) {
        try {
            fs.writeFileSync(fname,flat_message)
        } catch (err) {
            console.log(err)
        }
    }


    createWriteStream(fpath) {
        return fs.createWriteStream(fpath)
    }

    reset_file_stream(file_output,save_fpath) {
        try {
            file_output.close()
            let file_tag = Math.floor(Math.random()*100)
            fs.renameSync(save_fpath,save_fpath + '_' + Date.now() + '_' + file_tag)
            return fs.createWriteStream(save_fpath)
        } catch (e) {
            return false
        }
    }
    

    async ensure_directories(front) {
        let top_dir = ''
        if ( front[0] === '.' ) {
            top_dir = process.cwd()
            front = front.substr(1)
        }
        let dirs = front.split('/')
        for ( let dir of dirs ) {
            let check_dir = top_dir + '/' + dir
            try {
                await fsPromise.mkdir(check_dir)
            } catch (e) {
            }
            top_dir = check_dir
        }
    }


    async make_path(output_dir,output_file,ensure_dir) {
        let front = output_dir
        if ( (front[front.length -1] !== '/') && (output_file[0] !== '/') ) {
            front += '/'
        }
        if ( ensure_dir ) {
            await this.ensure_directories(front)
        }
        let path = front + output_file
        return path
    }

}



module.exports = new DefaultFileOps()